-- NSS Blood Connect — initial schema
-- Two user-facing roles only: DONOR, REQUESTER. No admin/hospital/org roles.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text,
  email text,
  role text not null check (role in ('DONOR', 'REQUESTER')),
  city text,
  area text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_city_area on public.profiles (city, area);

-- ---------------------------------------------------------------------------
-- donor_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.donor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  blood_group text not null check (blood_group in ('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-')),
  date_of_birth date,
  last_donation_date date,
  availability_status text not null default 'MAYBE'
    check (availability_status in ('AVAILABLE', 'MAYBE', 'UNAVAILABLE')),
  -- Approximate location only (deliberately low precision) — see privacy rule in README.
  approx_lat numeric(6, 3),
  approx_lng numeric(6, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donor_profiles_dob_past check (date_of_birth is null or date_of_birth <= current_date),
  constraint donor_profiles_last_donation_past check (last_donation_date is null or last_donation_date <= current_date)
);

create index if not exists idx_donor_profiles_blood_group on public.donor_profiles (blood_group);
create index if not exists idx_donor_profiles_availability on public.donor_profiles (availability_status);
-- Composite index for the matching engine's primary lookup (Phase 4).
create index if not exists idx_donor_profiles_matching on public.donor_profiles (blood_group, availability_status);

-- ---------------------------------------------------------------------------
-- blood_requests
-- ---------------------------------------------------------------------------
create table if not exists public.blood_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  blood_group text not null check (blood_group in ('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-')),
  units_required integer not null check (units_required > 0 and units_required <= 50),
  hospital_name text,
  facility_name text,
  location_area text,
  required_date date,
  required_time time,
  priority text not null default 'NORMAL' check (priority in ('NORMAL', 'URGENT', 'CRITICAL')),
  request_type text not null default 'NORMAL' check (request_type in ('NORMAL', 'EMERGENCY')),
  status text not null default 'CREATED' check (
    status in (
      'CREATED', 'MATCHING', 'CONTACTING_DONORS', 'PARTIALLY_FULFILLED',
      'FULFILLED', 'COMPLETED', 'CANCELLED', 'EXPIRED'
    )
  ),
  approx_lat numeric(6, 3),
  approx_lng numeric(6, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_blood_requests_requester on public.blood_requests (requester_id);
create index if not exists idx_blood_requests_status on public.blood_requests (status);
create index if not exists idx_blood_requests_priority on public.blood_requests (priority);
-- Composite index for the matching engine's primary lookup (Phase 4).
create index if not exists idx_blood_requests_matching on public.blood_requests (blood_group, status);
create index if not exists idx_blood_requests_created_at on public.blood_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- donor_matches
-- ---------------------------------------------------------------------------
create table if not exists public.donor_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests (id) on delete cascade,
  donor_id uuid not null references public.profiles (id) on delete cascade,
  -- Transparent software prioritization score only — never a medical/eligibility judgment.
  match_score numeric(5, 2),
  distance_km numeric(6, 2),
  match_status text not null default 'PENDING'
    check (match_status in ('PENDING', 'NOTIFIED', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Duplicate-match prevention: one match row per (request, donor).
  constraint donor_matches_unique_request_donor unique (request_id, donor_id)
);

create index if not exists idx_donor_matches_request on public.donor_matches (request_id);
create index if not exists idx_donor_matches_donor on public.donor_matches (donor_id);
create index if not exists idx_donor_matches_status on public.donor_matches (match_status);

-- ---------------------------------------------------------------------------
-- donor_responses
-- ---------------------------------------------------------------------------
create table if not exists public.donor_responses (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.donor_matches (id) on delete cascade,
  request_id uuid not null references public.blood_requests (id) on delete cascade,
  donor_id uuid not null references public.profiles (id) on delete cascade,
  response text not null default 'PENDING' check (response in ('PENDING', 'ACCEPTED', 'DECLINED')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  -- One response record per match — duplicate-response prevention.
  constraint donor_responses_unique_match unique (match_id)
);

create index if not exists idx_donor_responses_request on public.donor_responses (request_id);
create index if not exists idx_donor_responses_donor on public.donor_responses (donor_id);
create index if not exists idx_donor_responses_response on public.donor_responses (response);

-- ---------------------------------------------------------------------------
-- donation_records
-- ---------------------------------------------------------------------------
create table if not exists public.donation_records (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid references public.blood_requests (id) on delete set null,
  donation_date date not null,
  units integer not null check (units > 0 and units <= 10),
  facility text,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now()
);

create index if not exists idx_donation_records_donor on public.donation_records (donor_id);
create index if not exists idx_donation_records_request on public.donation_records (request_id);

-- ---------------------------------------------------------------------------
-- request_status_history (audit trail — never hard-deleted)
-- ---------------------------------------------------------------------------
create table if not exists public.request_status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests (id) on delete cascade,
  status text not null check (
    status in (
      'CREATED', 'MATCHING', 'CONTACTING_DONORS', 'PARTIALLY_FULFILLED',
      'FULFILLED', 'COMPLETED', 'CANCELLED', 'EXPIRED'
    )
  ),
  changed_by uuid references public.profiles (id) on delete set null,
  "timestamp" timestamptz not null default now(),
  notes text
);

create index if not exists idx_request_status_history_request on public.request_status_history (request_id);
create index if not exists idx_request_status_history_timestamp on public.request_status_history ("timestamp" desc);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid references public.blood_requests (id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id, is_read);
create index if not exists idx_notifications_created_at on public.notifications (created_at desc);
