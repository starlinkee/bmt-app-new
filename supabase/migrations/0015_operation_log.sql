create table if not exists public.operation_log (
  id           bigint generated always as identity primary key,
  operation    text not null,
  result       jsonb,
  called_at    timestamptz not null default now()
);

alter table public.operation_log enable row level security;
create policy "service_role full access" on public.operation_log using (true);
