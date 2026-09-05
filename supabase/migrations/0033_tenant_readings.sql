alter table public.tenants
  add column if not exists reading_token uuid default gen_random_uuid();

-- Zapewniamy, że każdy istniejący najemca dostanie unikalny token
update public.tenants
set reading_token = gen_random_uuid()
where reading_token is null;

alter table public.settlement_groups
  add column if not exists tenant_reading_keys jsonb not null default '[]'::jsonb;
