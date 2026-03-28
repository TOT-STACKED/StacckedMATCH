-- StackMatch Supabase Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- VENDORS
-- ─────────────────────────────────────────
create table vendors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  category text not null,
  tagline text not null,
  description text,
  color text default '#E64E1A',
  logo_url text,
  website_url text,
  demo_url text,
  pricing_model text, -- 'subscription' | 'per-cover' | 'freemium' | 'quote'
  typical_roi text,
  founded_year int,
  hq_location text,
  -- Matching metadata
  pos_integrations text[] default '{}', -- ['lightspeed','square','zonal','oracle','vita','other']
  problem_tags text[] default '{}',     -- ['labour','waste','bookings','loyalty','ops','data']
  venue_types text[] default '{}',      -- ['pub','restaurant','hotel','cafe','qsr','enterprise']
  -- Stats shown on swipe card (max 3)
  stat_1_val text,
  stat_1_lbl text,
  stat_2_val text,
  stat_2_lbl text,
  stat_3_val text,
  stat_3_lbl text,
  -- Operator hook line
  hook text,
  -- Admin
  is_active boolean default true,
  is_verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Vendor auth link (so vendors can manage their own listing)
create table vendor_users (
  id uuid primary key default uuid_generate_v4(),
  vendor_id uuid references vendors(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'editor', -- 'owner' | 'editor'
  created_at timestamptz default now(),
  unique(vendor_id, user_id)
);

-- ─────────────────────────────────────────
-- OPERATOR SESSIONS & AUTH
-- ─────────────────────────────────────────
create table operator_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  venue_name text,
  venue_type text,
  pos_system text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- SWIPE SESSIONS
-- ─────────────────────────────────────────
create table swipe_sessions (
  id uuid primary key default uuid_generate_v4(),
  operator_id uuid references operator_profiles(id) on delete cascade,
  session_key text, -- for anonymous sessions (stored in localStorage)
  problem_tag text not null,
  pos_system text not null,
  share_token text unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- SWIPES (individual left/right decisions)
-- ─────────────────────────────────────────
create table swipes (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references swipe_sessions(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  direction text not null check (direction in ('left', 'right')),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- SHORTLISTS (saved right-swipes)
-- ─────────────────────────────────────────
create table shortlists (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references swipe_sessions(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  created_at timestamptz default now(),
  unique(session_id, vendor_id)
);

-- ─────────────────────────────────────────
-- INTRO REQUESTS
-- ─────────────────────────────────────────
create table intro_requests (
  id uuid primary key default uuid_generate_v4(),
  operator_id uuid references operator_profiles(id),
  vendor_id uuid references vendors(id) on delete cascade,
  session_id uuid references swipe_sessions(id),
  operator_email text not null,
  operator_name text,
  venue_name text,
  message text,
  status text default 'pending' check (status in ('pending', 'sent', 'declined')),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────

alter table vendors enable row level security;
alter table vendor_users enable row level security;
alter table operator_profiles enable row level security;
alter table swipe_sessions enable row level security;
alter table swipes enable row level security;
alter table shortlists enable row level security;
alter table intro_requests enable row level security;

-- Vendors: public read, vendor_users can update their own
create policy "vendors_public_read" on vendors for select using (is_active = true);
create policy "vendors_owner_update" on vendors for update
  using (id in (select vendor_id from vendor_users where user_id = auth.uid()));
create policy "vendors_owner_insert" on vendors for insert
  with check (auth.uid() is not null);

-- Vendor users
create policy "vendor_users_own" on vendor_users for all
  using (user_id = auth.uid());

-- Operator profiles
create policy "operator_own" on operator_profiles for all
  using (id = auth.uid());

-- Swipe sessions: owners can see their own; share_token allows public read
create policy "sessions_own" on swipe_sessions for all
  using (operator_id = auth.uid() or operator_id is null);
create policy "sessions_share_read" on swipe_sessions for select
  using (share_token is not null);

-- Swipes
create policy "swipes_session_insert" on swipes for insert
  with check (true);
create policy "swipes_own_read" on swipes for select
  using (session_id in (select id from swipe_sessions where operator_id = auth.uid()));

-- Shortlists
create policy "shortlists_insert" on shortlists for insert with check (true);
create policy "shortlists_read" on shortlists for select using (true);

-- Intro requests
create policy "intro_requests_insert" on intro_requests for insert with check (true);
create policy "intro_requests_vendor_read" on intro_requests for select
  using (vendor_id in (select vendor_id from vendor_users where user_id = auth.uid()));
create policy "intro_requests_operator_read" on intro_requests for select
  using (operator_id = auth.uid());

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
create index on vendors(is_active);
create index on vendors using gin(pos_integrations);
create index on vendors using gin(problem_tags);
create index on swipe_sessions(operator_id);
create index on swipe_sessions(share_token);
create index on swipes(session_id);
create index on shortlists(session_id);
create index on intro_requests(vendor_id);

-- ─────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger vendors_updated_at before update on vendors
  for each row execute function update_updated_at();
create trigger profiles_updated_at before update on operator_profiles
  for each row execute function update_updated_at();
