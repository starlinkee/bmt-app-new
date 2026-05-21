-- Tabela stagingowa dla niedopasowanych transakcji z CSV.
-- Do transactions trafiają wyłącznie rekordy po przypisaniu do najemcy.

-- Usuń stare UNMATCHED (nie powinny istnieć w docelowym modelu)
delete from public.transactions where status = 'UNMATCHED';

create table if not exists public.transaction_staging (
  id           bigint generated always as identity primary key,
  amount       numeric(10,2) not null,
  date         date not null,
  title        text not null default '',
  bank_account text,
  raw_data     jsonb,
  created_at   timestamptz not null default now()
);

alter table public.transaction_staging enable row level security;
create policy "service_role full access" on public.transaction_staging using (true);
