-- Track when an account creation number was linked to a proxy (24h timer)

alter table public.proxies
  add column if not exists account_creation_number_linked_at timestamptz;

-- Backfill from ACN assigned_at when already linked
update public.proxies p
set account_creation_number_linked_at = a.assigned_at
from public.account_creation_numbers a
where p.account_creation_number_id = a.id
  and p.account_creation_number_linked_at is null
  and a.assigned_at is not null;
