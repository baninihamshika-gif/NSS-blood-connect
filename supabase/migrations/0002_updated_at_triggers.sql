-- Keep updated_at current on every row update.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_donor_profiles_updated_at on public.donor_profiles;
create trigger trg_donor_profiles_updated_at
  before update on public.donor_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_blood_requests_updated_at on public.blood_requests;
create trigger trg_blood_requests_updated_at
  before update on public.blood_requests
  for each row execute function public.set_updated_at();

drop trigger if exists trg_donor_matches_updated_at on public.donor_matches;
create trigger trg_donor_matches_updated_at
  before update on public.donor_matches
  for each row execute function public.set_updated_at();
