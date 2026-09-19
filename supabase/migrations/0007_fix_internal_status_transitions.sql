-- Phase 6 fix: 0006's validate_blood_request_status_transition() checked
-- `auth.role() = 'service_role'` to distinguish trusted internal transitions
-- from direct client updates. That works for match-donors (a genuinely
-- separate service-role session) but NOT for the auto-fulfillment update
-- inside sync_match_status_from_response(): that function is SECURITY
-- DEFINER, but auth.role()/auth.uid() reflect the JWT of the ORIGINAL
-- caller for the whole transaction (a donor inserting their own
-- donor_responses row), not the function's elevated execution privilege —
-- SECURITY DEFINER changes who can bypass RLS-adjacent grants, not what
-- auth.role() reports. Every genuine auto-fulfillment update was rejected
-- as if a client had tried it directly. Found by the Phase 6 test suite,
-- not by design — same "add a migration, don't rewrite history" pattern
-- as 0004 fixing 0003.
--
-- Fix: a transaction-local GUC flag that only trusted internal trigger code
-- sets, immediately before a privileged status update. It's invisible to
-- and unsettable by ordinary client requests (no RPC exposes it), and
-- `is_local = true` means it can never leak past the current transaction.

create or replace function public.validate_blood_request_status_transition()
returns trigger
language plpgsql
as $$
declare
  is_trusted boolean;
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  is_trusted := (coalesce(auth.role(), '') = 'service_role')
    or (coalesce(current_setting('app.bypass_status_restriction', true), '') = 'true');

  if not is_trusted and new.status not in ('CANCELLED', 'COMPLETED') then
    raise exception 'Only server-side logic may set blood_requests.status to %', new.status
      using errcode = '42501';
  end if;

  allowed := case old.status
    when 'CREATED' then new.status in ('MATCHING', 'CANCELLED')
    when 'MATCHING' then new.status in ('CONTACTING_DONORS', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED')
    when 'CONTACTING_DONORS' then new.status in ('PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED')
    when 'PARTIALLY_FULFILLED' then new.status in ('FULFILLED', 'COMPLETED', 'CANCELLED')
    when 'FULFILLED' then new.status in ('COMPLETED', 'CANCELLED')
    else false
  end;

  if not allowed then
    raise exception 'Invalid blood_requests status transition: % -> %', old.status, new.status
      using errcode = '22023';
  end if;

  return new;
end;
$$;

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

      perform set_config('app.bypass_status_restriction', 'true', true);

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
