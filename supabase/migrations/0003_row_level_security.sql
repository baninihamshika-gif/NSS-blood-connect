-- Row Level Security for all tables. Every table used by the app is protected;
-- nothing is left publicly readable/writable by default.

alter table public.profiles enable row level security;
alter table public.donor_profiles enable row level security;
alter table public.blood_requests enable row level security;
alter table public.donor_matches enable row level security;
alter table public.donor_responses enable row level security;
alter table public.donation_records enable row level security;
alter table public.request_status_history enable row level security;
alter table public.notifications enable row level security;

-- Helper: current user's role, used by policies below without re-querying profiles
-- (SECURITY DEFINER avoids RLS recursion on the profiles table itself).
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Any authenticated user can read a profile's public-safe fields (name, role,
-- city/area) — needed to show requester/donor names on matches and requests.
-- Sensitive contact fields (phone) are still only ever surfaced to the owner
-- via the app layer; the table itself doesn't split columns further in Phase 0.
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No delete policy: profiles are never hard-deleted from the client.

-- ---------------------------------------------------------------------------
-- donor_profiles
-- ---------------------------------------------------------------------------
-- Donor discovery for matching needs read access broader than "self", but we
-- do not expose exact coordinates here (approx_lat/lng only, already low
-- precision at the schema level) or phone numbers (those live on profiles and
-- are not queried for discovery).
create policy "donor_profiles_select_authenticated"
  on public.donor_profiles for select
  to authenticated
  using (true);

create policy "donor_profiles_insert_self"
  on public.donor_profiles for insert
  to authenticated
  with check (user_id = auth.uid() and public.current_user_role() = 'DONOR');

create policy "donor_profiles_update_self"
  on public.donor_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- blood_requests
-- ---------------------------------------------------------------------------
-- Donors need to see active requests to be matched against them; requesters
-- need to see their own requests regardless of status.
create policy "blood_requests_select_authenticated"
  on public.blood_requests for select
  to authenticated
  using (true);

create policy "blood_requests_insert_self"
  on public.blood_requests for insert
  to authenticated
  with check (requester_id = auth.uid() and public.current_user_role() = 'REQUESTER');

create policy "blood_requests_update_owner"
  on public.blood_requests for update
  to authenticated
  using (requester_id = auth.uid())
  with check (requester_id = auth.uid());

-- ---------------------------------------------------------------------------
-- donor_matches
-- ---------------------------------------------------------------------------
-- Visible to the matched donor and to the requester who owns the request.
-- No insert/update policy for authenticated users: matches are written by
-- server-side logic (service role / Edge Functions) in later phases, never
-- directly by the browser.
create policy "donor_matches_select_participant"
  on public.donor_matches for select
  to authenticated
  using (
    donor_id = auth.uid()
    or exists (
      select 1 from public.blood_requests br
      where br.id = donor_matches.request_id and br.requester_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- donor_responses
-- ---------------------------------------------------------------------------
create policy "donor_responses_select_participant"
  on public.donor_responses for select
  to authenticated
  using (
    donor_id = auth.uid()
    or exists (
      select 1 from public.blood_requests br
      where br.id = donor_responses.request_id and br.requester_id = auth.uid()
    )
  );

-- A donor may create their own response only for a match that is actually
-- theirs, and only once (unique constraint on match_id handles duplicates).
create policy "donor_responses_insert_self"
  on public.donor_responses for insert
  to authenticated
  with check (
    donor_id = auth.uid()
    and exists (
      select 1 from public.donor_matches dm
      where dm.id = donor_responses.match_id and dm.donor_id = auth.uid()
    )
  );

create policy "donor_responses_update_self"
  on public.donor_responses for update
  to authenticated
  using (donor_id = auth.uid())
  with check (donor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- donation_records
-- ---------------------------------------------------------------------------
create policy "donation_records_select_owner"
  on public.donation_records for select
  to authenticated
  using (
    donor_id = auth.uid()
    or exists (
      select 1 from public.blood_requests br
      where br.id = donation_records.request_id and br.requester_id = auth.uid()
    )
  );

create policy "donation_records_insert_self"
  on public.donation_records for insert
  to authenticated
  with check (donor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- request_status_history (audit trail)
-- ---------------------------------------------------------------------------
-- Read-only from the client; visible to the request's requester and to any
-- donor who has a match on that request (so they can see progress).
create policy "request_status_history_select_participant"
  on public.request_status_history for select
  to authenticated
  using (
    exists (
      select 1 from public.blood_requests br
      where br.id = request_status_history.request_id and br.requester_id = auth.uid()
    )
    or exists (
      select 1 from public.donor_matches dm
      where dm.request_id = request_status_history.request_id and dm.donor_id = auth.uid()
    )
  );

-- No insert/update/delete policy for authenticated users: history rows are
-- written by trusted server-side logic (Phase 6), never directly by clients.

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create policy "notifications_select_self"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_self"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No insert policy for authenticated users: notifications are created by
-- trusted server-side logic (Phase 5+), never directly by clients.
