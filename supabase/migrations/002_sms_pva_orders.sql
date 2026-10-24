-- SMSPVA activation orders (ephemeral OTP numbers)

do $$ begin
  create type sms_pva_status as enum (
    'waiting',
    'received',
    'expired',
    'cancelled',
    'failed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.sms_pva_orders (
  id text primary key default gen_random_uuid()::text,
  smspva_order_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_name text not null default '',
  user_email text not null default '',
  country public.country_code not null,
  service text not null default 'opt130',
  service_name text not null default 'Vinted',
  phone_number text,
  sms_code text,
  sms_text text,
  status public.sms_pva_status not null default 'waiting',
  error_message text,
  created_at timestamptz not null default now(),
  code_received_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists sms_pva_orders_user_created_idx
  on public.sms_pva_orders (user_id, created_at desc);

create index if not exists sms_pva_orders_status_created_idx
  on public.sms_pva_orders (status, created_at desc);

create index if not exists sms_pva_orders_created_at_idx
  on public.sms_pva_orders (created_at desc);

alter table public.sms_pva_orders enable row level security;
