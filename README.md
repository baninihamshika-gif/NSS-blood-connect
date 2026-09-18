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
│   ├── requests/        RequestListItem (shared by request history + dashboard)
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
├── migrations/           numbered SQL migrations (schema, triggers, RLS)
└── functions/            Edge Functions: match-donors, emergency-search, notifications (Phase 4+)
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

Apply with the Supabase CLI:

```
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file's contents into the Supabase SQL editor in order.

**Status:** a live Supabase project is provisioned and linked; all 4 migrations are applied. `.env`
is populated locally (gitignored — never commit it). If you need to point this project at a
different Supabase instance, update `.env` and re-run `supabase link` + `supabase db push`.

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

```
npm run test
```

38 tests currently pass, covering: profile self-insert/update with cross-user negative tests; donor
role-gating on `donor_profiles`/`blood_requests` inserts (`current_user_role()`); match/response/
notification/history visibility restricted to participants; duplicate-match and duplicate-response
rejection (unique constraints); future-dated `date_of_birth`/`last_donation_date` and out-of-range
`units_required` rejected at the database level (defense in depth behind the Phase 2/3 forms' own
validation); and unauthenticated (anon) access returning zero rows from every sensitive table.

## Phase Plan

Work proceeds phase-by-phase. Each phase stops for explicit approval before the next begins.

| Phase | Scope | Status |
|---|---|---|
| 0 | Project initialization from scratch: tooling, routing, Supabase client, full schema + RLS foundation, auth (register/login/logout/password reset), protected routes, landing/dashboard shells | **Done** |
| 1 | Foundation hardening: full RLS verification across both roles (36 automated tests), loading/error/empty-states audit and fix | **Done** |
| 2 | Donor module: editable profile (basic info + donor details), availability control, real donation history query, privacy notice | **Done** |
| 3 | Requester module: real dashboard (own stats + recent requests), create request (normal/emergency), request history/details | **Done** |
| 4 | Matching engine: server-side matching, transparent ranking, `donor_matches` generation | Not started |
| 5 | Donor request & response: notify donors, accept/decline | Not started |
| 6 | Request tracking: status state machine, `request_status_history`, timeline UI | Not started |
| 7 | Emergency cascade: waves, timeouts, radius expansion, idempotency | Not started |
| 8 | Realtime, notifications, map (Leaflet/OSM) | Not started |
| 9 | Dashboards/analytics (Recharts), responsive polish, accessibility | Not started |
| 10 | Final QA/hardening, docs | Not started |

## Matching Rules (Phase 4)

Not yet implemented. When implemented, weights and eligibility windows will be documented here and
kept configurable rather than hard-coded, per the project's medical-safety rule.

## Known Limitations (through Phase 3)

- Request creation (normal + emergency), history, and details are live; matching, donor responses,
  the status-history timeline, and the map are still later phases.
- "Incoming Requests" on the donor dashboard stays an empty-state placeholder by design — a donor
  actually seeing matched requests depends on the matching engine (Phase 4) and donor-notification
  flow (Phase 5), which don't exist yet. Wiring a "preview" query against raw `blood_requests` now
  would jump ahead of those phases and show donors data with no real matching behind it.
- The emergency request form creates the `blood_requests` row (type `EMERGENCY`, priority
  `URGENT`/`CRITICAL`) but does **not** simulate "searching donors" or show fake donor counts — that
  behavior belongs to the matching engine (Phase 4) and cascade (Phase 7), neither of which exists yet.
  Showing invented numbers now would violate the "no fake production data" rule.
- Request details currently shows a single current status badge, not the full timeline UI from the
  reference design (✓ Request Created → ✓ Matching Started → ...) — that's explicitly Phase 6
  (`request_status_history` + timeline UI).
- No edit/cancel on an existing request yet — Phase 6 ("Completion and cancellation").
- The requester dashboard's stat tiles (Active/Emergency/Total/Fulfilled) are computed client-side
  from the requester's own `useMyBloodRequests()` result, not a separate aggregate query — fine at
  current scale; revisit with a dedicated count query if a requester's request list ever gets large.
- `blood_group` is intentionally **not** editable from the profile page — it's a safety-sensitive,
  self-reported field; the UI points users to contact support instead of allowing casual self-edits.
  (The database itself doesn't block a donor from updating their own `donor_profiles.blood_group` —
  RLS is row-level, not column-level, and there's no real verification workflow to gate it against
  yet since there's no Admin role. This is a UI-level friction choice, not a hard constraint.)
- `donation_records` has no write path from the UI yet (no donation-completion flow exists until
  Phase 6), so "Donation History" is a real, correctly-empty query — it'll show data once Phase 6
  lands, without needing further changes to the donor dashboard itself.
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
