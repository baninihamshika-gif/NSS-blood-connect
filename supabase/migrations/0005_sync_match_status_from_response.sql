-- Phase 5: lets a donor's own accept/decline affect donor_matches.match_status
-- without granting a direct client UPDATE policy on donor_matches (that table
-- stays reserved for trusted server-side writes, per the Phase 1 design — see
-- 0003's comment on donor_matches). A donor can already INSERT their own row
-- into donor_responses (RLS-gated to their own match). This trigger narrowly
-- mirrors that response onto the corresponding match's status — the only
-- values it can ever write are ACCEPTED/DECLINED, and only in response to an
-- insert/update RLS already scoped to the donor's own match, so it doesn't
-- reopen client control over match_status in general.

create or replace function public.sync_match_status_from_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.response in ('ACCEPTED', 'DECLINED') then
    update public.donor_matches
    set match_status = new.response
    where id = new.match_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_match_status_from_response on public.donor_responses;
create trigger trg_sync_match_status_from_response
  after insert or update on public.donor_responses
  for each row execute function public.sync_match_status_from_response();

-- Set responded_at from the server clock rather than trusting whatever the
-- client sends (or sends nothing) — fires whenever a response moves to a
-- terminal state.
create or replace function public.set_responded_at()
returns trigger
language plpgsql
as $$
begin
  if new.response in ('ACCEPTED', 'DECLINED') then
    new.responded_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_donor_responses_set_responded_at on public.donor_responses;
create trigger trg_donor_responses_set_responded_at
  before insert or update on public.donor_responses
  for each row execute function public.set_responded_at();
