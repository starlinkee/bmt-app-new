alter table public.transaction_staging
  add column if not exists is_duplicate boolean not null default false;
