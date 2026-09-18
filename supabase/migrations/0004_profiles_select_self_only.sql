-- Phase 1 privacy fix: profiles_select_authenticated (0003) used `using (true)`,
-- letting any authenticated user SELECT *any* profile row — including phone and
-- email, which RLS can't column-mask. That violates the "never expose donor
-- phone numbers publicly" rule. Nothing built so far reads another user's
-- profile (grepped: only self-lookups in useAuth.tsx), so tightening to
-- self-only costs nothing today.
--
-- When a later phase needs to show *other* users' basic info (e.g. a donor's
-- name on a match card), add a narrow mechanism then — either a view exposing
-- only non-sensitive columns (id, full_name, role, city, area) or a policy
-- scoped to an actual relationship (shared donor_matches/blood_requests row,
-- following the same participant pattern already used for donor_matches,
-- donor_responses, and request_status_history) — not a blanket read grant.

drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_self"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());
