# NSS Blood Connect

A real-time blood emergency coordination web application built around one central flow:

**REQUEST → MATCH → RESPOND → TRACK**

This project is being built phase-by-phase against a fixed engineering contract. Do not implement
future phases early — see [Phase Plan](#phase-plan) below.

## Product Concept

NSS Blood Connect converts a blood requirement into a coordinated request: identify suitable/available
donors, prioritize matches using transparent software rules, send donor requests, collect
accept/decline responses, track progress, and expand the search when the requirement is not fulfilled.

There are **only two user-facing roles** — there is no Admin page and no third role:

- **DONOR** — profile, availability, incoming requests, accept/decline, donation records.
- **REQUESTER** — dashboard, create blood request, emergency request, match donors, track requests.

NSS is the platform/organization context, not a separate user role.

**Safety rule:** the application does not make independent medical eligibility or
transfusion-compatibility decisions. Blood-group matching and donation eligibility follow explicit,
configured rules (documented in [Matching Rules](#matching-rules-phase-4)) and are not claimed to be
AI-driven or medically authoritative.

## Tech Stack

**Frontend:** React + Vite + TypeScript (strict mode), Tailwind CSS v4, React Router, TanStack Query,
React Hook Form + Zod, Recharts, Leaflet + OpenStreetMap, Lucide React.

**Backend/Platform:** Supabase (Auth, PostgreSQL with Row Level Security, Realtime, Edge Functions).
No separate Node/NestJS backend, Redis, BullMQ, or second database — the architecture stays on
Supabase unless a future phase documents a genuine reason to add something else.

## Project Structure

```
src/
├── components/
│   ├── ui/            reusable primitives (Button, Input, Card, Badge, EmptyState, ...)
│   ├── layout/         Navbar, PublicLayout, DashboardLayout
│   ├── dashboard/       dashboard-specific widgets (Phase 9)
│   ├── donor/           donor-specific components (reserved; donor pages are self-contained so far)
│   ├── requester/       requester-specific components (reserved; requester pages are self-contained so far)
│   ├── requests/        RequestListItem, RequestTimeline (shared across request pages)
│   ├── matching/        match cards (Phase 4+)
│   ├── notifications/   notification UI (Phase 8)
│   └── map/             Leaflet map components (Phase 8)
├── pages/
│   ├── public/          landing, login, register, password reset, 404
│   ├── donor/            donor dashboard and sub-pages
│   └── requester/        requester dashboard and sub-pages
├── hooks/                useAuth, useDonorProfile, useLandingStats, ...
├── services/             data-access helpers beyond simple hooks (added as needed)
├── lib/
│   ├── supabase.ts       Supabase client
│   ├── env.ts            environment variable handling
│   ├── validation/       Zod schemas
│   └── utilities/        pure helpers (added as needed)
├── types/                database.ts mirrors the Supabase schema
├── constants/            shared constants (blood groups, app name)
└── routes/               ProtectedRoute

supabase/
├── migrations/            numbered SQL migrations (schema, triggers, RLS)
└── functions/
    ├── _shared/           matching-logic.ts — pure scoring/compatibility/cascade logic, unit-tested
    │                      directly and imported unmodified by both functions below
    ├── match-donors/      deployed — single-pass matching engine (Phase 4)
    └── emergency-search/  deployed — wave/radius cascade (Phase 7)
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase project's values (Project Settings → API):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Only the anon/publishable key is ever used in frontend code. The service-role key is never placed in
this codebase. If the app is loaded without these variables set, it shows a "Supabase is not
configured" screen instead of crashing or silently failing.

Running the RLS test suite additionally needs `.env.test.local` (copy `.env.test.local.example`) with
a `SUPABASE_SERVICE_ROLE_KEY` — see [Testing](#testing).

## Database Setup

Migrations live in `supabase/migrations/` and are numbered in apply order:

1. `0001_initial_schema.sql` — all 8 tables (`profiles`, `donor_profiles`, `blood_requests`,
   `donor_matches`, `donor_responses`, `donation_records`, `request_status_history`,
   `notifications`), enums via check constraints, foreign keys, and indexes for matching queries.
2. `0002_updated_at_triggers.sql` — keeps `updated_at` current on mutable tables.
3. `0003_row_level_security.sql` — enables RLS on every table and defines access policies.
4. `0004_profiles_select_self_only.sql` — Phase 1 fix: tightens `profiles` SELECT from "any
   authenticated user" to self-only, since RLS can't mask individual columns and the original policy
   let any user read any other user's `phone`/`email`. Found by the Phase 1 RLS audit, not by design.
5. `0005_sync_match_status_from_response.sql` — Phase 5: a `SECURITY DEFINER` trigger that mirrors a
   donor's own `donor_responses` insert/update onto `donor_matches.match_status`. `donor_matches` has
   no client UPDATE policy (Phase 1 design — see 0003), so this is the narrow, audited path a donor's
   accept/decline can affect it through, rather than reopening general client write access to that
   table. A second trigger sets `responded_at` from the server clock, not a client-supplied value.
6. `0006_request_status_state_machine.sql` — Phase 6: the controlled status state machine. A `BEFORE
   UPDATE` trigger on `blood_requests` rejects illegal transitions and restricts direct client updates
   to only `CANCELLED`/`COMPLETED` (every other transition is system-driven). An `AFTER UPDATE` trigger
   auto-logs every real status change to `request_status_history`. Extends 0005's response-sync
   trigger so an `ACCEPTED` response also drives the request toward `PARTIALLY_FULFILLED`/`FULFILLED`.
   A further trigger auto-creates `donation_records` for each accepted donor when a request reaches
   `COMPLETED`.
7. `0007_fix_internal_status_transitions.sql` — Phase 6 fix: 0006's service-role check
   (`auth.role() = 'service_role'`) doesn't distinguish a genuinely-internal trigger-driven update from
   a client's own request, because `auth.role()` reflects the *original caller's* JWT for the whole
   transaction, not a `SECURITY DEFINER` function's elevated privilege — every real auto-fulfillment
   update was being rejected as if a client had attempted it directly. Fixed with a transaction-local
   GUC flag (`app.bypass_status_restriction`) that only trusted internal trigger code sets, immediately
   before a privileged update; no RPC exposes it to clients. Found by the Phase 6 test suite, same
   "add a migration, don't rewrite history" pattern as 0004 fixing 0003.
8. `0008_emergency_cascade.sql` — Phase 7: adds `blood_requests.cascade_tier_index` (nullable), tracking
   how far the emergency cascade has progressed through its radius tiers for a given request. Not
   protected beyond the existing owner-update policy — tampering with it can't cause anything unsafe,
   since `emergency-search` always excludes already-matched donors regardless of what this column says.

Apply with the Supabase CLI:

```
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file's contents into the Supabase SQL editor in order.

**Status:** a live Supabase project is provisioned and linked; all 8 migrations are applied. `.env`
is populated locally (gitignored — never commit it). If you need to point this project at a
different Supabase instance, update `.env` and re-run `supabase link` + `supabase db push`.

### Edge Functions

`match-donors` and `emergency-search` are deployed to the linked project; both import
`_shared/matching-logic.ts`. Redeploy after changes with:

```
supabase functions deploy match-donors --use-api
supabase functions deploy emergency-search --use-api
```

Redeploy **both** after touching `_shared/matching-logic.ts`, since each function bundles its own
copy of whatever it imports at deploy time — editing the shared file alone doesn't update either
already-deployed function. `--use-api` bundles server-side instead of via Docker — this machine
doesn't have Docker installed, and this flag makes that a non-issue. `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the platform for
every deployed function; nothing extra to configure.

### Email confirmation

The linked project requires email confirmation by default (`mailer_autoconfirm: false`). Because of
this, `register()` in `src/hooks/useAuth.tsx` does **not** insert the `profiles`/`donor_profiles` rows
at sign-up time when no session comes back — RLS requires `auth.uid()`, which doesn't exist yet for
an unconfirmed user. Instead, registration details are stashed in Supabase Auth's `user_metadata` at
sign-up, and `ensureProfile()` backfills the profile (and donor profile) from that metadata the first
time the user has an authenticated session — whether that's immediately (if confirmation is ever
turned off) or after they click the confirmation link and log in. This was verified end-to-end against
the live project: sign-up → admin-confirm → password login → profile insert respecting RLS → a
negative test confirming a user cannot insert a profile row under someone else's id (403 as expected).

Site URL and redirect allow-list on the Supabase project are set to `http://localhost:5173` for local
dev; update these in Auth settings before deploying elsewhere.

### Demo accounts (local dev only)

Two pre-confirmed accounts exist on the linked project for quick manual testing — one donor
(`demo.donor.nssblood@gmail.com`), one requester (`demo.requester.nssblood@gmail.com`) — with real
`profiles`/`donor_profiles` rows already seeded. Their credentials live in `.env` (not committed). The
demo requester also has two sample `blood_requests` (created through the real Phase 3 UI during
testing, left in place as example data rather than cleaned up).

The login page shows "Demo Donor"/"Demo Requester" one-click buttons when `VITE_DEMO_*` env vars are
set — but **only in `npm run dev`**. This is gated by `import.meta.env.DEV`, which Vite statically
replaces with `false` in a production build; the ternary constructing `demoAccounts` folds to
`{ donor: null, requester: null }` and the real credential strings never get embedded in the built
bundle (verified by grepping `dist/` for them — zero matches). The buttons themselves stay in the
bundle as inert UI (they just never render, since the accounts are `null`), which is expected and not
a secret-exposure concern.

To set this up on a fresh clone: create the two accounts in Supabase (Admin API or dashboard, with
`email_confirm: true`) and matching `profiles`/`donor_profiles` rows, then fill in `.env` per
`.env.example`. Optional — the app works fine with these unset, the buttons just don't appear.

### Privacy & RLS design notes

- Donor `approx_lat`/`approx_lng` are stored at reduced precision (3 decimal places, ~100m) — exact
  coordinates are never captured.
- `profiles` SELECT is self-only (migration `0004`) — RLS filters rows, not columns, so a broader
  policy would have let any authenticated user read any other user's `phone`/`email` directly via the
  REST API regardless of what the frontend UI chooses to display. When a later phase needs to show
  another user's name (e.g. on a match card), extend access narrowly then — a view over non-sensitive
  columns, or a policy scoped to an actual shared-match/request relationship — not a blanket read.
- `donor_matches`, `donor_responses`, and `notifications` have **no client insert policy** for the
  core matching/notification writes — those are produced by trusted server-side logic
  (Edge Functions / service role) starting in Phase 4, not by the browser.
- `request_status_history` is append-only from trusted server-side logic; nothing is hard-deleted.

## Development

```
npm install
npm run dev       # start dev server
npm run build      # type-check + production build
npm run lint       # oxlint
npm run test       # RLS test suite (see below)
```

## Testing

`tests/rls.test.ts` is an end-to-end Row Level Security verification suite — it runs against the
**live linked Supabase project** (not a mock), asserting real authenticated Postgrest calls succeed
or fail as expected for every table, for both roles, including negative cases ("can donor B read
donor A's private match?") and duplicate-prevention (unique constraints on `donor_matches` and
`donor_responses`). It creates disposable test users via the Admin API and deletes them (cascading
their rows) in `afterAll`, so it's safe to run repeatedly and leaves no residue.

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.test.local` (gitignored, **never** read by application
code — `tests/setup/testClient.ts` is the only place that touches it, and only to create/confirm/
delete disposable test accounts). `.env` supplies the same `VITE_SUPABASE_URL` /
`VITE_SUPABASE_PUBLISHABLE_KEY` the app uses, so tests exercise the same RLS policies real users hit.

**Caveat learned the hard way (Phase 4):** these tests share the live database with the
[demo accounts](#demo-accounts-local-dev-only) — a matching test that asserted an exact total match
count broke the moment the demo donor became a real `AVAILABLE`/eligible O+ donor, because it
legitimately also matched the test's O+ request. The fix, and the pattern to follow for any future
matching/cascade test: assert donor-specific membership (`expect(matchedDonorIds.has(x)).toBe(true)`)
rather than exact counts, since a live shared database can never be assumed to be under a test's
exclusive control.

```
npm run test
```

40 RLS tests currently pass, covering: profile self-insert/update with cross-user negative tests; donor
role-gating on `donor_profiles`/`blood_requests` inserts (`current_user_role()`); match/response/
notification/history visibility restricted to participants; duplicate-match and duplicate-response
rejection (unique constraints); future-dated `date_of_birth`/`last_donation_date` and out-of-range
`units_required` rejected at the database level (defense in depth behind the Phase 2/3 forms' own
validation); unauthenticated (anon) access returning zero rows from every sensitive table; and (Phase
5) the `donor_responses` → `donor_matches.match_status` trigger reflecting the latest response while a
direct client update to `match_status` is still rejected.

`tests/matching-logic.test.ts` (21 tests) unit-tests the matching engine's pure scoring/compatibility
math in isolation — see [Matching Engine](#matching-engine-phase-4) below.

`tests/matching-function.test.ts` (6 tests) is a live integration test against the **deployed**
`match-donors` Edge Function: ownership authorization (a different requester or a donor cannot trigger
matching on someone else's request — 403), 404 on a nonexistent request, correct filtering (only the
compatible + available + eligible donor matches, not the incompatible/unavailable/recently-donated
ones), the `CREATED` → `MATCHING` status transition with its `request_status_history` row, and
idempotency (re-running does not create a duplicate `donor_matches` row).

`tests/request-state-machine.test.ts` (9 tests) covers Phase 6's state machine against the live
database: rejects a client setting a system-only status value, rejects an illegal edge even for
service role, allows the legal client transition `CREATED` → `CANCELLED`, rejects any transition out
of a terminal state, confirms the auto-history-logging trigger, and drives a full real scenario —
two donors accept, request auto-progresses `MATCHING` → `PARTIALLY_FULFILLED` → `FULFILLED`, the
requester completes it, and `donation_records` rows appear for both donors.

`tests/emergency-cascade.test.ts` (9 tests) is a live integration test against the **deployed**
`emergency-search` Edge Function, using synthetic donor/request coordinates (1° latitude ≈ 111km) so
radius-tier progression is actually exercised now, despite real location-capture UI not existing yet
(Phase 8): ownership rejection, wave-by-wave radius expansion (10km → 25km → 50km, each wave finding
only the newly-in-range donor), a donor placed beyond every tier that's never matched at any wave,
exhaustion once all tiers are tried, idempotency after exhaustion, timeout-driven expiry of a
backdated `NOTIFIED` match, the `CREATED` → `MATCHING` transition, and stop-when-fulfilled (no further
matches created even with other compatible donors available). Two real bugs were caught by this
suite, not by inspection — see [Emergency Cascade](#emergency-cascade-phase-7) below.

95 tests total, all passing against the live project.

## Phase Plan

Work proceeds phase-by-phase. Each phase stops for explicit approval before the next begins.

| Phase | Scope | Status |
|---|---|---|
| 0 | Project initialization from scratch: tooling, routing, Supabase client, full schema + RLS foundation, auth (register/login/logout/password reset), protected routes, landing/dashboard shells | **Done** |
| 1 | Foundation hardening: full RLS verification across both roles (36 automated tests), loading/error/empty-states audit and fix | **Done** |
| 2 | Donor module: editable profile (basic info + donor details), availability control, real donation history query, privacy notice | **Done** |
| 3 | Requester module: real dashboard (own stats + recent requests), create request (normal/emergency), request history/details | **Done** |
| 4 | Matching engine: server-side matching (Edge Function), transparent ranking, `donor_matches` generation | **Done** |
| 5 | Donor request & response: notify donors on match, donor sees request, accept/decline | **Done** |
| 6 | Request tracking: status state machine, `request_status_history`, timeline UI, completion/cancellation, partial fulfillment | **Done** |
| 7 | Emergency cascade: waves, timeouts, radius expansion, idempotency | **Done** |
| 8 | Realtime, notifications, map (Leaflet/OSM) | **Done** |
| 9 | Dashboards/analytics (Recharts), responsive polish, accessibility | **Done** |
| 10 | Final QA/hardening, docs | Not started |

## Matching Engine (Phase 4)

Implemented as the `match-donors` Supabase Edge Function (`supabase/functions/match-donors/`) —
deployed and running server-side. The client only ever sends a `requestId`; every eligibility check
and score is computed from trusted database reads inside the function, using the service-role key
(which bypasses RLS deliberately — this function IS the trusted server-side logic that
`donor_matches`'s RLS policy defers to, since that table has no client insert policy). **The client
never supplies, and the server never trusts, a match score or an eligibility flag.**

All decision logic lives in `matching-logic.ts`, a plain dependency-free TypeScript module imported
unmodified by both the Deno edge function and the Vitest unit tests (`tests/matching-logic.test.ts`)
— so the exact function producing a real donor's score is the one being tested, not a reimplementation
of it.

### Safety gate: blood-group compatibility

Standard, published ABO/Rh whole-blood-donation compatibility chart (O- universal donor, AB+
universal recipient), encoded in `DONOR_CAN_GIVE_TO` in `matching-logic.ts`. Used **only** as a
software filter to surface plausible candidates. Per the project's safety rule, this is not clinical
clearance — the UI never claims a match is "verified compatible," only that it's a suggested
candidate. Real transfusion compatibility must be confirmed by qualified medical staff at the point
of donation, regardless of what this system shows.

### Safety gate: donation eligibility window

`MIN_DAYS_SINCE_LAST_DONATION = 90` (days) — a donor who donated more recently than this is excluded
from candidacy entirely (not just scored lower). **This is an explicit, named placeholder, not a
medically-reviewed rule** — real minimum intervals vary by country/regulation. It must be replaced
with a value from qualified medical/regulatory guidance before this system is used for real donation
coordination; changing it means editing one named constant in `matching-logic.ts`.

### Transparent prioritization weights

Ranks already-eligible candidates — **not** a medical fitness score. Matches the project spec's
documented weights out of 100:

| Factor | Weight | Notes |
|---|---|---|
| Distance | 25 | Haversine distance between `approx_lat/lng` on the request and the donor; unknown coordinates (location-capture is opt-in — see [Phase 8](#realtime-notifications--map-phase-8)) score a neutral half-credit rather than being penalized. Linear falloff to 0 at `MAX_MATCH_DISTANCE_KM = 50`. |
| Availability | 15 | `AVAILABLE` = full credit, `MAYBE` = half, `UNAVAILABLE` donors are excluded from candidacy before scoring even applies. |
| Donation timing | 10 | 0 at the eligibility boundary, ramping to full credit by `DONATION_TIMING_FULL_SCORE_DAYS = 180` days since last donation; no history recorded = full credit (treated as ready). |
| Response history | 10 | Accept rate from past `donor_responses`. Real once a donor has responded to prior matches (Phase 5); a donor with no history yet = neutral half-credit, not penalized. |

These four factors sum to a weight budget of 60, matching the spec exactly (25+15+10+10). **The
remaining 40 is deliberately left unallocated** rather than filled with an invented fifth factor — the
spec is explicit that additional weighting "must be finalized only if justified," and no
medically-reviewed justification exists yet for what that should be. The 0-100 "match relevance"
percentage shown in the UI renormalizes across only these four implemented factors (divides the raw
weighted sum by 60), so it still reads as a clean percentage without fabricating criteria.

### Scope: single batch, not a cascade

One run matches up to `MATCH_CANDIDATE_LIMIT = 20` top-scored eligible candidates. It does not
expand search radius or retry in waves if too few candidates exist (Emergency Cascade, Phase 7), and
does not show fake "searching donors" progress. Re-running matching on the same request is idempotent
— existing `donor_matches` rows get their score/distance refreshed, not duplicated (enforced by the
`(request_id, donor_id)` unique constraint plus explicit insert-vs-update branching in the function),
and an existing match's `match_status` is never reset by a re-run.

### Privacy: no donor identity in match results

The requester-facing match list (`DonorMatchCard`) shows only blood group, distance, and match
relevance — never the donor's name. This follows directly from the Phase 1 RLS fix: `profiles` SELECT
is self-only, so a requester cannot read a matched donor's `full_name` even if the UI tried to show
it. Per the reference UI's "Contact: Available after confirmation," identity/contact should only
surface after some stronger confirmation than "accepted a match" — the accepted-state UI itself says
"Contact: Available after confirmation," which Phase 5 deliberately does not build yet (see below).

## Donor Response Flow (Phase 5)

When `match-donors` inserts a **new** `donor_matches` row, it now also creates a `notifications` row
for that donor and sets `match_status` straight to `NOTIFIED` (skipping the `PENDING` default) —
notification happens as part of the same pipeline that creates the match, not as a separately gated
step, matching the spec's conceptual flow ("Notify selected donors" immediately follows "Create
donor_matches").

The donor dashboard's "Incoming Requests" queries `donor_matches` for the signed-in donor (embedding
`blood_requests` via a real foreign key — unlike the `donor_matches` ↔ `donor_profiles` pairing used
elsewhere, which has no direct FK and needs two queries merged client-side). Opening a match shows
its details and, for a `NOTIFIED` match, Accept/Decline buttons.

**Accept/decline mechanics:** `donor_matches` still has no client UPDATE policy (Phase 1's deliberate
design — that table is server-controlled). A donor accepting or declining inserts directly into
`donor_responses` with the final decision (RLS already lets a donor insert their own response for
their own match; the unique constraint on `match_id` prevents responding twice). A new trigger
(migration `0005`) mirrors that response onto `donor_matches.match_status` — the only values it can
ever write are `ACCEPTED`/`DECLINED`, and only in reaction to an insert/update RLS already scoped to
the donor's own match, so this doesn't reopen general client control over `match_status`. A second
trigger sets `responded_at` from the server clock rather than trusting the client.

Once accepted, the donor sees an "✓ Request Accepted" card (hospital name, "Contact: Available after
confirmation") matching the required reference UI — and the requester's match list picks up the
`ACCEPTED` badge automatically through the same trigger, no extra requester-side code needed. No
fabricated ETA or a `[VIEW DIRECTIONS]` button — those need real routing/ETA data, which no phase
builds (Phase 8 adds approximate locations and a map, not turn-by-turn routing), and would otherwise be
exactly the kind of invented data the project's rules prohibit.

## Request Tracking (Phase 6)

### The state machine

Enforced by database triggers on `blood_requests` (migrations `0006`/`0007`), not just client-side
convention — this is the real authorization boundary, the same way RLS is for table access:

```
CREATED ──▶ MATCHING ──▶ PARTIALLY_FULFILLED ──▶ FULFILLED ──▶ COMPLETED
  │            │                 │                   │
  └────────────┴─────────────────┴───────────────────┴──▶ CANCELLED
```

(`CONTACTING_DONORS` is a legal node in the graph but isn't currently reachable — see
[Known Limitations](#known-limitations-through-phase-9) below.)

- A **client update** (the requester, via their own RLS-permitted update) may only ever set the new
  status to `CANCELLED` or `COMPLETED` — the two genuinely user-driven actions. Attempting to set
  `MATCHING`/`PARTIALLY_FULFILLED`/`FULFILLED` directly is rejected, even though the requester owns
  the row — otherwise they could fake progress without any real matching or donor acceptance behind
  it.
- Every transition, from whichever path caused it, is validated against the graph above — an illegal
  edge (e.g. `CREATED` straight to `COMPLETED`) is rejected even for trusted server-side code.
- `COMPLETED`, `CANCELLED`, and `EXPIRED` are terminal — no further transitions are accepted from
  them.

### Automatic progression from donor acceptances

"1 accepted donor = 1 unit" is a documented simplification (the schema doesn't yet capture a
per-donor unit pledge). When an `ACCEPTED` response brings the accepted-donor count to somewhere
between 0 and `units_required`, the request moves to `PARTIALLY_FULFILLED`; once it reaches or
exceeds `units_required`, it moves straight to `FULFILLED` (skipping `PARTIALLY_FULFILLED` if a
single acceptance covers the whole requirement). Status only ever moves forward automatically, never
backward.

### Completion closes the loop back to Phase 2

Marking a `FULFILLED`/`PARTIALLY_FULFILLED` request `COMPLETED` triggers creation of a
`donation_records` row for every donor whose match is `ACCEPTED` on that request — which is what
finally gives the donor dashboard's "Donation History" (built in Phase 2, correctly empty ever
since) real data. Verified end-to-end through the actual UI, not just the database: create a request
→ match → donor accepts → auto-`FULFILLED` → requester clicks "Mark Completed" → the donor's
dashboard shows a real completed donation.

### Timeline UI

`RequestTimeline` renders the formal state-machine path (from `request_status_history`, the one
reliable source of truth) as a checkmark list with real timestamps — adapting the reference mockup's
checkmark/circle visual structure to this project's actual status names rather than the reference's
illustrative ones (e.g. no distinct "12 Donors Contacted" / "3 Donors Responded" timeline *entries*,
since those aren't state-machine transitions). That information isn't dropped, though — it's shown
as a live, always-accurate summary line ("N donors contacted — M accepted so far") computed from
`donor_matches` at render time, rather than frozen into a history row that could drift from reality.

## Emergency Cascade (Phase 7)

Implemented as a second Edge Function, `emergency-search`, sharing `_shared/matching-logic.ts` with
`match-donors` so the same compatibility/eligibility/scoring rules apply — the cascade doesn't
reimplement matching, it adds what a single `match-donors` pass deliberately doesn't do: waves,
timeouts, and radius expansion. Same trust model throughout: the client sends only a `requestId`.

### Radius tiers and waves

`EMERGENCY_CASCADE_RADII_KM = [10, 25, 50]` (km) — a documented, configurable business-rule sequence,
not a medical one. Each invocation walks forward from `blood_requests.cascade_tier_index` (persisted
so a later call resumes rather than re-scanning), notifying every untried eligible donor within the
first tier that has one. A `null` donor/request distance counts as "within every tier" (consistent
with the neutral-if-unknown treatment already used in scoring), so this is fully exercised today via
the test suite's synthetic coordinates, even though real location data is still sparse in practice
(location-setting is opt-in — see [Phase 8](#realtime-notifications--map-phase-8)).
One call = one step forward (find more within the current tier, or expand to the next one) — there's
no background polling; the requester presses "Continue Emergency Search" to advance.

### Timeout handling

A `NOTIFIED` match older than `CASCADE_WAVE_TIMEOUT_MINUTES = 30` (a documented placeholder, not an
operationally-reviewed SLA) is marked `EXPIRED` at the start of every cascade invocation — lazily, on
next call, rather than via a background job (no scheduling infrastructure like `pg_cron` exists, and
adding one wasn't clearly required). This frees that donor's "slot" without waiting on them
indefinitely, and an expired donor is never re-notified for the same request (still counted as
"already tried").

### Stopping conditions

Every response includes `done` and, when true, a `reason`: `fulfilled` (enough donors have accepted —
matches the state machine's own fulfillment trigger, this function doesn't duplicate that logic, just
defers to it), `closed` (the request reached a terminal status some other way, e.g. the requester
cancelled it mid-cascade), or `exhausted` (every tier examined, still short). None of these loop
forever or fabricate progress — `exhausted` is reported honestly, with the UI suggesting the
requester's real options (cancel, wait, or leave it open) rather than pretending the search continues.

### Two real bugs the test suite caught

- The `exhausted`/`fulfilled`/`closed` early-return branches didn't include `timedOutExpired` in their
  JSON response, even though the expiry side-effect had already happened — an isolated debug script
  showed expiry working correctly, but the *reported* count was silently wrong whenever a call reached
  one of those branches instead of the "new wave" success path. Now every response branch reports it.
- `emergency-search` never made the same `CREATED` → `MATCHING` transition `match-donors` makes,
  discovered by noticing the reference-style timeline UI still showed "Matching" as pending even after
  real donors had been found and notified. Fixed to match `match-donors`'s behavior exactly.

### A UI bug worth calling out

The "Activate" vs. "Continue Emergency Search" button label was originally driven by the current
browser session's mutation state — which resets on page reload, so a requester who'd already run the
cascade and came back later would misleadingly see "Activate" again. Fixed to read
`blood_requests.cascade_tier_index` (real server-side progress) instead.

## Realtime, Notifications & Map (Phase 8)

### Realtime

Every table a screen needs to stay live on (`donor_matches`, `blood_requests`, `notifications`,
`request_status_history`) is added to the `supabase_realtime` publication (migration `0009`). A single
reusable hook, `useRealtimeInvalidate`, wraps `supabase.channel(...).on('postgres_changes', ...)` and
invalidates the relevant TanStack Query key(s) on any change — it doesn't merge the payload into cache
by hand, it just triggers a refetch through the existing RLS-scoped query, so a client can never see
more via the realtime channel than its own `SELECT` policy already allows. Wired into every hook whose
data can change from another session: `useNotifications`, `useIncomingMatches`,
`useIncomingMatchDetails`, `useDonorMatches`, `useBloodRequestDetails`, `useRequestStatusHistory`, and
`useMyBloodRequests`.

Verified live, cross-session, with two separate browser *contexts* (separate storage — a single
context shares one Supabase auth session across tabs via `localStorage`, which isn't representative of
two different real users): a requester's request-details page, left open with no reload, correctly
flips from "Matching" to "Fulfilled," the donor badge to `ACCEPTED`, and the map pin from orange to
green within seconds of a donor accepting the match in a completely separate browser session.

**A real bug this caught:** `useIncomingMatchDetails` (the donor's own single-match detail page) was
missing from that wiring — and separately, `useRespondToMatch`'s success handler invalidated the query
key `['incoming-matches', user.id]` (the donor's *list* of matches), not `['incoming-match', matchId]`
(the *singular* detail page's own key, a naming mismatch, not just a missing call). The practical
effect: a donor who accepted or declined a match on its detail page never saw their own action reflected
on that same page — not a stale-list bug, a stale-detail-page bug, and one that only live cross-session
testing surfaces (a component test with a mocked query client wouldn't have caught the real key
mismatch). Fixed by adding the same `useRealtimeInvalidate` wiring used everywhere else, filtered to
that one match row (`id=eq.${matchId}`) — consistent with the rest of the codebase's pattern rather than
a one-off manual invalidation.

### Notifications

`NotificationBell` (in the navbar, next to Log out) is the first UI for the `notifications` table,
which `match-donors`/`emergency-search` have been writing to since Phase 5/7 with no viewer until now.
Shows the 20 most recent, unread-count badge (capped at "9+"), "Mark all read," relative timestamps, and
click-to-navigate — routed by role: a requester goes straight to the relevant request; a donor goes to
their dashboard, not the specific match, because the notification row doesn't carry the donor's
`donor_matches.id`, only the `request_id` — a known simplification (see below), not a missing feature by
accident.

### Approximate location capture

`LocationPicker` (Leaflet + OpenStreetMap, no API key needed) is used on both the donor profile
("Approximate location") and request creation (normal + emergency). Click-to-place, drag-to-adjust, an
optional "Use my location" via `navigator.geolocation`, and always-visible manual latitude/longitude
number inputs as a first-class alternative, not just a fallback. Every coordinate is rounded to 3
decimal places (~100m) client-side, before it ever reaches the database — consistent with the project's
existing "never expose a donor's exact location" rule from Phase 1 onward; there's no separate
server-side rounding step because the raw, unrounded coordinate is simply never sent.

### Map visualization

`RequestMap` (read-only, on the request-details page) plots the request's location (red) and every
matched donor with a known location (green/orange/gray by `match_status`), with a legend and a "never
exact addresses" note. **A real bug found and fixed during live testing:** the map originally centered
on the request at a fixed `zoom={11}` — a donor 205km away (a genuine distance computed once both a
request and a donor had real coordinates, the first time that pipeline had real, non-placeholder data
end-to-end) fell silently outside that viewport, with no visual indication a pin existed off-screen.
Fixed with a `FitBounds` helper (`useMap()` + `L.fitBounds`/`setView`) that fits the viewport to every
known point — the request plus every donor pin, however far apart — instead of guessing a zoom level;
a single point still gets a sensible default zoom rather than an unusably tight fit. The effect is keyed
on the points' actual coordinates (not the array reference, which is new on every render) so a
realtime-triggered re-render doesn't keep snapping the view back and fighting a user's manual pan/zoom.

### Graceful degradation

`MapErrorBoundary` catches render-time map failures and falls back to a plain message, never taking
down the surrounding page — verified as a standard React error-boundary pattern by inspection (forcing
a genuine Leaflet internal exception in an automated test is artificial; the boundary itself is a
handful of lines of standard, well-understood React). The network-failure case was verified directly:
with all OpenStreetMap tile requests blocked mid-session, the map still renders (a blank Leaflet canvas
with working zoom controls and a visible marker — tile load failures don't throw, Leaflet just shows
nothing for that tile), the page doesn't crash, and — critically for `LocationPicker` specifically — the
manual latitude/longitude inputs stay fully visible and usable throughout, so the feature never actually
depends on the map succeeding.

## Dashboards, Analytics & Accessibility (Phase 9)

### Charts

Two charts, one per role, both built from data each dashboard was already fetching — no separate
analytics endpoint and no fabricated figures. `RequestStatusChart` (requester dashboard) groups the
requester's own requests by status; `DonationsOverTimeChart` (donor dashboard) sums a donor's own
`donation_records` units by month. Both use the same color convention as the badges shown elsewhere for
the same status (`toneHex` mirrors `statusTone`'s Tailwind shades), and both show an `EmptyState` rather
than an empty or zero-filled chart when there's nothing to plot yet.

**A real bug found and fixed via live testing:** `RequestStatusChart` originally called
`useMyBloodRequests()` internally — the same hook the dashboard page already calls for its stat tiles.
Since that hook carries a Phase 8 realtime subscription keyed by a fixed channel name
(`my-blood-requests:${userId}`), two concurrently mounted instances tried to subscribe to the same
channel twice; Supabase-js throws when a second `.on()` is added to an already-subscribed channel, and
with no error boundary in the tree, the whole dashboard rendered blank. Neither `tsc` nor the test suite
catches this class of bug, since it only manifests when two instances of the same realtime-backed hook
are actually mounted together at runtime. Fixed by having the chart take its data as a prop from the
page that already fetched it, instead of re-fetching (and re-subscribing) internally — the same fix
doubles as the more efficient approach, since it removes a redundant subscription entirely rather than
just tolerating it.

### Accessibility

- `NotificationBell`'s dropdown toggle now exposes `aria-haspopup`/`aria-expanded`, the panel has
  `role="region" aria-label="Notifications"`, and pressing Escape closes it (previously only
  click-outside did).
- Fixed three real WCAG AA contrast failures found by checking the actual hex values in use:
  `text-gray-400` (#9ca3af on white ≈ 2.5:1, needs 4.5:1 for normal text) on the map's donor-privacy
  disclaimer, notification timestamps, and not-yet-reached steps in the request tracking timeline — all
  bumped to `text-gray-500` (≈4.8:1). Decorative icons and native input placeholder text were
  deliberately left alone (icons are `aria-hidden`; placeholder text has an established lighter
  convention and is backed by a real adjacent `<label>`).
- Both charts wrap their SVG in an `aria-hidden` container with a sibling `sr-only` paragraph stating
  the same data as a sentence, and pass `accessibilityLayer={false}` to Recharts. Recharts' own
  accessibility layer (`role="application" tabindex="0"` on the SVG, for arrow-key data exploration) is
  a real, deliberate feature — disabling it isn't a downgrade so much as a consistency choice: paired
  with the `aria-hidden` wrapper needed for the `sr-only` alternative, an *enabled* accessibility layer
  would leave a keyboard-only user tabbing onto a stop a screen reader announces nothing useful for
  (content hidden, but still focusable) — worse than either extreme alone. Confirmed live: the chart
  SVGs carry neither attribute after the fix.

### Responsive polish

Audited at a 375px mobile viewport across every major page (landing, login, both dashboards, request
creation/details, donor profile) with live Playwright screenshots, not just Tailwind's responsive
classes read in the abstract. Two real, global-impact bugs found:

- **Navbar wrapping mid-word**: at 375px, "NSS Blood Connect" and the "Log out" button both wrapped
  their own text onto a second line (ugly, and on some strings genuinely hard to read) instead of the
  row itself wrapping. Fixed by making the navbar's flex container wrap as a whole (`flex-wrap`) with
  `whitespace-nowrap` on each label, so a narrow screen gets a clean two-row layout (logo, then nav
  links) instead of individual text fragments breaking mid-string. This affects every page, since
  `Navbar` is global.
- **Notification dropdown overflowing off-screen**: the panel was a fixed 320px wide, right-aligned to
  its own small positioning ancestor (the bell button's wrapper `div`), not to the viewport — on a
  375px screen, right-aligning a 320px panel to a button sitting well right-of-center pushed the panel's
  left edge past the screen's left edge entirely (confirmed via screenshot: "Notifications" rendered as
  "otifications", visibly clipped). Fixed with a responsive positioning switch: `fixed inset-x-4 top-16`
  (anchored to the actual viewport, with margins) below the `sm` breakpoint, reverting to the original
  `absolute right-0` panel anchored to the button above it.
- Also narrowed the "Blood group / Units required" two-column grid (request creation and emergency
  request forms) to stack on narrow screens (`grid-cols-1 sm:grid-cols-2`) — the blood-group `<select>`'s
  own "Select blood group" placeholder text was being clipped by the half-width column at 375px.

## Known Limitations (through Phase 9)

- Request creation (normal + emergency), history, details, matching, the emergency cascade, donor
  notification/response, the full status-tracking lifecycle (auto-fulfillment, completion,
  cancellation), realtime updates, in-app notifications, and approximate-location/map are all live.
- The distance match factor (and the cascade's radius tiers) only discriminate once *both* sides of a
  pair have set a location — still sparse in practice since location-setting is opt-in on both the donor
  profile and request creation forms, not required. No matching-engine or cascade changes are needed as
  more real coordinates accumulate; this is purely a function of how much location data users choose to
  provide.
- `NotificationBell`'s click-to-navigate sends a donor to their dashboard rather than the specific match,
  because the `notifications` row only carries `request_id`, not the donor's own `donor_matches.id` —
  fixable by having `match-donors`/`emergency-search` also write the match id onto the notification, not
  attempted here to avoid touching already-shipped Edge Function logic outside this phase's stated scope.
- No push/browser/email notifications — "in-app notifications" per the spec means the `NotificationBell`
  UI, not a background delivery channel; nothing in the spec's Phase 8 scope calls for one.
- The map has no clustering — with very many donor pins in a small area, overlapping markers aren't
  grouped. Not a concern at current real data volumes; worth revisiting if that changes.
- One chart per dashboard (status breakdown for requesters, donations-over-time for donors) — covers
  the spec's "dashboards/analytics" scope with real per-user data rather than building out a larger
  analytics surface nothing in the spec specifically calls for.
- Adding Recharts grew the production bundle from ~880KB to ~1.23MB (gzipped ~359KB), pushing further
  past Vite's 500KB chunk-size warning threshold. No code-splitting (`dynamic import()`) was introduced
  to address it — the warning is pre-existing (this build already exceeded 500KB before Phase 9) and
  splitting the bundle wasn't part of this phase's stated scope; worth revisiting in Phase 10 if load
  performance becomes a concrete concern rather than a build-time warning.
- The accessibility and responsive-layout work in this phase was a manual, targeted audit (live
  Playwright screenshots at a mobile viewport, contrast values checked by hand, keyboard/Escape behavior
  verified live) driven by what the audit actually found, not a full WCAG conformance pass or an
  automated tool like `axe-core` wired into CI — real issues were fixed as they turned up, but an
  automated audit could surface others this pass didn't.
- Accepting a match, and even completing a request, still doesn't reveal donor/requester contact info
  to each other — intentional, matching the reference UI's own "Contact: Available after confirmation"
  literally shown on the *accepted* state, not just before it. No phase in the spec explicitly owns
  "build the actual contact-reveal mechanism," so it stays deferred rather than guessed at.
- No decline-reason capture, and the cascade doesn't immediately react to a single decline mid-wave by
  notifying a replacement — it re-evaluates candidacy (including freeing up "slots" from declines and
  timeouts) the next time the requester invokes it, not via a live event trigger. Consistent with
  "one call = one step forward," not silent background activity.
- `match-donors` and `emergency-search` are both invoked directly from the client via
  `supabase.functions.invoke` on a button click, not automatically on request creation — a requester
  has to press "Find Matching Donors" or "Activate/Continue Emergency Search." Nothing in the spec
  requires auto-triggering, and doing so silently would make matching runs harder to reason about
  while testing; revisit if a later phase wants it automatic.
- Cascade timeout detection is lazy (evaluated at the start of the next `emergency-search` invocation),
  not proactive — a stale `NOTIFIED` match only actually flips to `EXPIRED` when the requester next
  presses "Continue Emergency Search," not the instant `CASCADE_WAVE_TIMEOUT_MINUTES` elapses. No
  scheduling infrastructure (`pg_cron` or similar) exists to make this proactive, and adding one wasn't
  clearly required by the spec.
- `CONTACTING_DONORS` is a legal node in the state machine graph but nothing currently transitions
  into it — this implementation's `match-donors` notifies donors in the same step as creating the
  match (see [Donor Response Flow](#donor-response-flow-phase-5)), so there's no separate "matched but
  not yet contacted" moment to represent. Kept in the graph for schema completeness / in case a future
  phase introduces a real gap between the two.
- The requester dashboard's stat tiles (Active/Emergency/Total/Fulfilled) are computed client-side
  from the requester's own `useMyBloodRequests()` result, not a separate aggregate query — fine at
  current scale; revisit with a dedicated count query if a requester's request list ever gets large.
- `blood_group` is intentionally **not** editable from the profile page — it's a safety-sensitive,
  self-reported field; the UI points users to contact support instead of allowing casual self-edits.
  (The database itself doesn't block a donor from updating their own `donor_profiles.blood_group` —
  RLS is row-level, not column-level, and there's no real verification workflow to gate it against
  yet since there's no Admin role. This is a UI-level friction choice, not a hard constraint.)
- "1 accepted donor = 1 unit" (see [Request Tracking](#request-tracking-phase-6)) is a simplification;
  a donor who actually gives a different unit count is a real-world case this schema doesn't yet model.
- Landing page stats (critical requests, available donors) are live Supabase counts, not mock data,
  but will read 0 until real profiles/requests exist.
- Email confirmation is required on the linked project; see [Email confirmation](#email-confirmation)
  above for how the register flow handles this via `user_metadata` backfill.
- No general seed/demo data beyond the two labeled [demo accounts](#demo-accounts-local-dev-only) —
  deliberately not auto-populating the wider database, so nothing could be mistaken for real emergency
  data as the app grows.
- Auth emails (confirmation, password reset) send through Supabase's default/shared mailer, which is
  rate-limited and not meant for production — configure custom SMTP before launch.
- `ProtectedRoute` only redirects on a *role mismatch* (e.g. a donor hitting `/requester/dashboard`);
  if a user is authenticated but has no profile row at all (only reachable if registration was
  interrupted in a way `ensureProfile` can't recover from — no metadata and no row), it currently lets
  them through to either dashboard rather than blocking. This is a UX gap, not a security one — RLS is
  what actually gates data access, and an EmptyState now surfaces the missing-profile condition on the
  donor dashboard. Worth a proper "complete your profile" flow in a later phase.
- Component-level tests (e.g. for `ProtectedRoute`'s redirect logic) aren't written yet; Phase 1
  testing focused on RLS, which is the real authorization boundary — see [Testing](#testing).
