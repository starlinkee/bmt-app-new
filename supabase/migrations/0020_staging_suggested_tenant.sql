alter table public.transaction_staging
  add column if not exists suggested_tenant_id bigint references public.tenants(id) on delete set null;
