-- Phase 8: adds the tables that benefit from live updates to the
-- `supabase_realtime` publication. Realtime respects each table's existing
-- RLS SELECT policies automatically (a client only receives change events
-- for rows they could already read via Postgrest) — no new policies needed.
--
-- donor_matches: a requester watching a request sees donor responses land
--   live; a donor watching their dashboard sees new matches/notifications
--   without a manual refresh.
-- blood_requests: status changes (auto-fulfillment, completion) reflect
--   live on the request details page.
-- notifications: the notification bell updates live as new ones arrive.
-- request_status_history: the timeline updates live alongside status.
alter publication supabase_realtime add table public.donor_matches;
alter publication supabase_realtime add table public.blood_requests;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.request_status_history;
