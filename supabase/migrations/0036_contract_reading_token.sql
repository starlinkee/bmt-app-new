alter table public.contracts
  add column if not exists reading_token uuid default gen_random_uuid();

-- Inicjalizacja tokenów dla istniejących umów
update public.contracts
set reading_token = gen_random_uuid()
where reading_token is null;

-- Dodanie indeksu, bo po tym polu będziemy szukać z publicznego linku
create index if not exists contracts_reading_token_idx on public.contracts (reading_token);
