-- Phase 7: tracks emergency-cascade progress on a request. NULL = the
-- cascade has never run for this request. Otherwise, the index into the
-- emergency-search Edge Function's EMERGENCY_CASCADE_RADII_KM tiers that
-- has been examined so far (0 = smallest radius tried, etc.) — used so a
-- re-invocation resumes from where it left off instead of re-scanning
-- already-exhausted tiers. Not used by the single-pass matcher
-- (match-donors), which has no radius filter.
--
-- No RLS/trigger protection is added for this column beyond the existing
-- owner-update policy: unlike blood_requests.status, tampering with it
-- can't cause anything unsafe. The worst case is a requester resetting
-- their own request's cascade progress, which at most causes redundant
-- re-scanning of a radius tier — the emergency-search function still
-- excludes already-matched donors regardless of what this column says, so
-- no duplicate donor_matches can result (same unique constraint as always).
alter table public.blood_requests
  add column if not exists cascade_tier_index smallint;
