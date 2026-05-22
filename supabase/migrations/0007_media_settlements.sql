create table if not exists public.media_settlements (
  id             bigint generated always as identity primary key,
  group_id       bigint not null references public.settlement_groups (id) on delete restrict,
  month          int not null,
  year           int not null,
  spreadsheet_id text not null,
  drive_pdf_id   text not null,
  created_at     timestamptz not null default now(),
  unique (group_id, month, year)
);

alter table public.media_settlements enable row level security;
create policy "service_role full access" on public.media_settlements using (true);

alter table public.invoices
  add column if not exists media_settlement_id bigint
    references public.media_settlements (id) on delete set null;
