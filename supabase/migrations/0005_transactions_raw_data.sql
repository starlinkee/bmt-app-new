alter table public.transactions
  add column if not exists raw_data jsonb;
