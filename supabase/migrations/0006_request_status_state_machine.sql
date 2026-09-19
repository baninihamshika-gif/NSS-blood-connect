-- Phase 6: controlled status state machine for blood_requests, automatic
-- audit history, automatic fulfillment progression from donor acceptances,
-- and automatic donation_records on completion.

-- ---------------------------------------------------------------------------
-- 1. Reject invalid transitions.
-- ---------------------------------------------------------------------------
-- Client-initiated updates (the requester, via their own RLS-permitted
-- update on blood_requests) may only ever self-transition into CANCELLED or
-- COMPLETED — the two genuinely user-driven actions. Every other transition
-- (MATCHING, PARTIALLY_FULFILLED, FULFILLED) is system-driven, either by the
-- match-donors Edge Function (service role) or by the fulfillment-progress
-- trigger below (also effectively service role, via SECURITY DEFINER). This
-- also closes a gap the plain ownership RLS policy leaves open on its own:
-- without this, a requester could set their own request straight to
-- MATCHING/FULFILLED without any real matching ever happening.
create or replace function public.validate_blood_request_status_transition()
returns trigger
language plpgsql
as $$
declare
  is_service boolean;
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  is_service := (coalesce(auth.role(), '') = 'service_role');

  if not is_service and new.status not in ('CANCELLED', 'COMPLETED') then
    raise exception 'Only server-side logic may set blood_requests.status to %', new.status
      using errcode = '42501';
  end if;

  allowed := case old.status
    when 'CREATED' then new.status in ('MATCHING', 'CANCELLED')
    when 'MATCHING' then new.status in ('CONTACTING_DONORS', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED')
    when 'CONTACTING_DONORS' then new.status in ('PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED')
    when 'PARTIALLY_FULFILLED' then new.status in ('FULFILLED', 'COMPLETED', 'CANCELLED')
    when 'FULFILLED' then new.status in ('COMPLETED', 'CANCELLED')
    else false -- COMPLETED, CANCELLED, EXPIRED are terminal
  end;

  if not allowed then
    raise exception 'Invalid blood_requests status transition: % -> %', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_blood_request_status_transition on public.blood_requests;
create trigger trg_validate_blood_request_status_transition
  before update on public.blood_requests
  for each row execute function public.validate_blood_request_status_transition();

-- ---------------------------------------------------------------------------
-- 2. Automatic audit history — every real status change is logged, from
--    whatever path caused it (client cancel/complete, or a service-role
--    transition), so the timeline UI has one reliable source of truth.
-- ---------------------------------------------------------------------------
create or replace function public.log_blood_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> old.status then
    insert into public.request_status_history (request_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_blood_request_status_change on public.blood_requests;
create trigger trg_log_blood_request_status_change
  after update on public.blood_requests
  for each row execute function public.log_blood_request_status_change();

-- ---------------------------------------------------------------------------
-- 3. Extend the Phase 5 response-sync trigger: an ACCEPTED response also
--    drives the request toward PARTIALLY_FULFILLED/FULFILLED. "1 accepted
--    donor = 1 unit" is a documented simplification — the schema doesn't
--    (yet) capture a per-donor unit pledge, and donation_records (below)
--    is where a real unit count eventually belongs. Status only ever moves
--    forward here, never backward.
-- ---------------------------------------------------------------------------
create or replace function public.sync_match_status_from_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_accepted_count int;
begin
  if new.response not in ('ACCEPTED', 'DECLINED') then
    return new;
  end if;

  update public.donor_matches
  set match_status = new.response
  where id = new.match_id;

  if new.response = 'ACCEPTED' then
    select id, status, units_required into v_request
    from public.blood_requests
    where id = new.request_id;

    if v_request.status in ('MATCHING', 'CONTACTING_DONORS', 'PARTIALLY_FULFILLED') then
      select count(*) into v_accepted_count
      from public.donor_matches
      where request_id = new.request_id and match_status = 'ACCEPTED';

      if v_accepted_count >= v_request.units_required and v_request.status <> 'FULFILLED' then
        update public.blood_requests set status = 'FULFILLED' where id = new.request_id;
      elsif v_accepted_count > 0 and v_request.status = 'MATCHING' then
        update public.blood_requests set status = 'PARTIALLY_FULFILLED' where id = new.request_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. On completion, create donation_records for every donor who accepted —
--    connects this phase's "Completion" action to Phase 2's donation
--    history, which has been a correctly-empty query until now because
--    nothing ever wrote to that table. NOT EXISTS guards against creating a
--    duplicate if this somehow fires more than once for the same request.
-- ---------------------------------------------------------------------------
create or replace function public.create_donation_records_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'COMPLETED' and old.status <> 'COMPLETED' then
    insert into public.donation_records (donor_id, request_id, donation_date, units, facility, status)
    select dm.donor_id, new.id, current_date, 1, new.hospital_name, 'COMPLETED'
    from public.donor_matches dm
    where dm.request_id = new.id
      and dm.match_status = 'ACCEPTED'
      and not exists (
        select 1 from public.donation_records dr
        where dr.donor_id = dm.donor_id and dr.request_id = new.id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_donation_records_on_completion on public.blood_requests;
create trigger trg_create_donation_records_on_completion
  after update on public.blood_requests
  for each row execute function public.create_donation_records_on_completion();
