-- Dedicated permanent numbers for account creation (separate from phone_numbers)

do $$ begin
  create type account_creation_number_status as enum (
    'available',
    'assigned',
    'retired'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.account_creation_numbers (
  id text primary key default gen_random_uuid()::text,
  country public.country_code not null,
  number text not null,
  provider text not null default '',
  status public.account_creation_number_status not null default 'available',
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_creation_numbers_number_unique
  on public.account_creation_numbers (number);

create index if not exists account_creation_numbers_status_idx
  on public.account_creation_numbers (status);

create index if not exists account_creation_numbers_assigned_to_idx
  on public.account_creation_numbers (assigned_to);

create index if not exists account_creation_numbers_country_idx
  on public.account_creation_numbers (country);

alter table public.account_creation_numbers enable row level security;
