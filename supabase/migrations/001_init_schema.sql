-- SecondChance portal schema (relational replacement for Firestore)
-- Run in Supabase SQL Editor or: supabase db push

create extension if not exists "pgcrypto";

do $$ begin
  create type user_role as enum ('admin', 'manager', 'salesman');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('active', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type country_code as enum ('FR', 'BE', 'UK', 'DE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proxy_status as enum (
    'fresh', 'available', 'active', 'assigned', 'expired', 'flagged', 'retired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type proxy_lane as enum ('backup', 'active');
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_status as enum (
    'fresh', 'available', 'assigned', 'flagged', 'retired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type phone_status as enum (
    'available', 'active', 'inactive', 'expired', 'retired',
    'assigned', 'flagged', 'banned', 'banned_with_balance'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type phone_number_type as enum ('temporary', 'permanent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_type as enum ('proxy', 'phone');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('pending', 'approved', 'rejected', 'fulfilled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type import_batch_type as enum ('proxy', 'phone', 'email');
exception when duplicate_object then null; end $$;

-- ─── Profiles (1:1 with auth.users) ───────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'salesman',
  country country_code,
  pool_countries country_code[] not null default '{}',
  active_proxy_limit integer not null default 4,
  status user_status not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_status_idx on public.profiles (status);

-- ─── Import batches ───────────────────────────────────────────────────────────

create table if not exists public.import_batches (
  id text primary key default gen_random_uuid()::text,
  type import_batch_type not null,
  imported_by uuid references public.profiles (id) on delete set null,
  imported_at timestamptz not null default now(),
  country country_code,
  count integer not null default 0,
  raw_file_name text not null default ''
);

-- ─── Emails ───────────────────────────────────────────────────────────────────

create table if not exists public.emails (
  id text primary key default gen_random_uuid()::text,
  email text not null,
  password text not null default '',
  status email_status not null default 'fresh',
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  synced_proxy_id text,
  synced_at timestamptz,
  synced_proxy_host text,
  synced_proxy_port text,
  synced_proxy_country country_code
);

create unique index if not exists emails_email_unique
  on public.emails (lower(email));
create index if not exists emails_status_idx on public.emails (status);
create index if not exists emails_assigned_to_idx on public.emails (assigned_to);

-- ─── Proxies ──────────────────────────────────────────────────────────────────

create table if not exists public.proxies (
  id text primary key default gen_random_uuid()::text,
  country country_code not null,
  host text not null,
  port text not null,
  username text not null default '',
  password text not null default '',
  provider text not null default '',
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status proxy_status not null default 'fresh',
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  batch_id text references public.import_batches (id) on delete set null,
  notes text not null default '',
  proxy_cheap_id text,
  lane proxy_lane,
  accounts_created boolean not null default false,
  staging_done boolean not null default false,
  restricted boolean not null default false,
  synced_email_id text references public.emails (id) on delete set null,
  synced_at timestamptz,
  synced_email_email text,
  synced_email_password text,
  vinted_username text not null default '',
  vinted_password text not null default '',
  phone_id text,
  phone_number text,
  created_at timestamptz not null default now()
);

create index if not exists proxies_status_idx on public.proxies (status);
create index if not exists proxies_assigned_to_idx on public.proxies (assigned_to);
create index if not exists proxies_country_idx on public.proxies (country);
create index if not exists proxies_assigned_at_idx on public.proxies (assigned_at);
create index if not exists proxies_expires_at_idx on public.proxies (expires_at);
create unique index if not exists proxies_proxy_cheap_id_unique
  on public.proxies (proxy_cheap_id) where proxy_cheap_id is not null;

-- ─── Phone numbers ────────────────────────────────────────────────────────────

create table if not exists public.phone_numbers (
  id text primary key default gen_random_uuid()::text,
  country country_code not null,
  number text not null,
  provider text not null default '',
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status phone_status not null default 'available',
  number_type phone_number_type not null default 'temporary',
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  batch_id text references public.import_batches (id) on delete set null,
  notes text not null default '',
  lane proxy_lane,
  proxy_id text references public.proxies (id) on delete set null,
  proxy_host text,
  proxy_port text,
  proxy_country country_code,
  created_at timestamptz not null default now()
);

create unique index if not exists phone_numbers_number_unique
  on public.phone_numbers (number);
create index if not exists phone_numbers_status_idx on public.phone_numbers (status);
create index if not exists phone_numbers_assigned_to_idx on public.phone_numbers (assigned_to);
create index if not exists phone_numbers_country_idx on public.phone_numbers (country);

-- Finish circular / deferred FKs
do $$ begin
  alter table public.emails
    add constraint emails_synced_proxy_id_fkey
    foreign key (synced_proxy_id) references public.proxies (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.proxies
    add constraint proxies_phone_id_fkey
    foreign key (phone_id) references public.phone_numbers (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ─── User country pools ───────────────────────────────────────────────────────

create table if not exists public.user_pools (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_name text not null default '',
  user_email text not null default '',
  country country_code not null,
  size_per_lane integer not null default 3,
  backup_limit integer,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (user_id, country)
);

create index if not exists user_pools_user_id_idx on public.user_pools (user_id);

-- ─── Requests ─────────────────────────────────────────────────────────────────

create table if not exists public.requests (
  id text primary key default gen_random_uuid()::text,
  type request_type not null,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  requested_by_name text not null default '',
  requested_by_email text not null default '',
  country country_code not null,
  reason text not null default '',
  status request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_by_name text,
  reviewed_by_email text,
  reviewed_at timestamptz,
  fulfilled_item_id text,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_requested_by_idx on public.requests (requested_by);

-- ─── Notifications ────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id text primary key default gen_random_uuid()::text,
  uid uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  message text not null,
  read boolean not null default false,
  related_id text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_uid_created_idx
  on public.notifications (uid, created_at desc);

-- ─── Audit log ────────────────────────────────────────────────────────────────

create table if not exists public.audit_logs (
  id text primary key default gen_random_uuid()::text,
  actor_uid uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

-- ─── Pool config (singleton) ──────────────────────────────────────────────────

create table if not exists public.pool_config (
  id text primary key default 'default',
  default_size_per_lane integer not null default 3,
  by_country jsonb not null default '{
    "FR": {"sizePerLane": 3},
    "BE": {"sizePerLane": 3},
    "UK": {"sizePerLane": 3},
    "DE": {"sizePerLane": 3}
  }'::jsonb,
  updated_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.pool_config (id)
values ('default')
on conflict (id) do nothing;

-- ─── Auto-create profile on signup (optional safety net) ──────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'salesman'),
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── RLS: data access goes through Next.js API (service role). ────────────────
-- Authenticated users may read their own profile; everything else is API-only.

alter table public.profiles enable row level security;
alter table public.proxies enable row level security;
alter table public.emails enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.user_pools enable row level security;
alter table public.requests enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.import_batches enable row level security;
alter table public.pool_config enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = uid);

-- Service role bypasses RLS automatically.
