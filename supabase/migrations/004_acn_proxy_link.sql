-- Link account creation numbers to proxies; salesman can mark number as changed

do $$ begin
  alter type public.account_creation_number_status add value 'changed';
exception
  when duplicate_object then null;
  when others then null;
end $$;

alter table public.account_creation_numbers
  add column if not exists proxy_id text references public.proxies (id) on delete set null;

alter table public.account_creation_numbers
  add column if not exists proxy_host text;

alter table public.account_creation_numbers
  add column if not exists proxy_port text;

alter table public.account_creation_numbers
  add column if not exists proxy_country public.country_code;

create index if not exists account_creation_numbers_proxy_id_idx
  on public.account_creation_numbers (proxy_id);

alter table public.proxies
  add column if not exists account_creation_number_id text
    references public.account_creation_numbers (id) on delete set null;

alter table public.proxies
  add column if not exists account_creation_number text;
