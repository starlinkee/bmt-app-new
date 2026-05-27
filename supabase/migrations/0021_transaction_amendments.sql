create table public.transaction_amendments (
  id           bigint generated always as identity primary key,
  transaction_id bigint not null references public.transactions(id) on delete cascade,
  before_data  jsonb not null,
  after_data   jsonb not null,
  amended_at   timestamptz not null default now(),
  note         text
);

alter table public.transaction_amendments enable row level security;
create policy "service_role full access" on public.transaction_amendments using (true);

create index on public.transaction_amendments (transaction_id);
