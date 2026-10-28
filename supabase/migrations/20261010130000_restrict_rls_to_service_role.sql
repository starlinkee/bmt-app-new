-- Zamknięcie dostępu anon do tabel w schemacie public.
--
-- Dotychczasowe polityki "service_role full access" były tworzone bez klauzuli TO,
-- więc dotyczyły roli PUBLIC (czyli także anon) - klucz anon (publiczny, siedzi w
-- bundlu przeglądarki) dawał pełny odczyt i zapis. Kod serwera używa service role
-- (omija RLS), przeglądarka używa Supabase tylko do auth i storage.
--
-- Plan B (wycofanie): supabase/rollback/20261010130000_restrict_rls_to_service_role.down.sql

drop policy if exists "service_role full access" on public.properties;
create policy "service_role full access" on public.properties to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.tenants;
create policy "service_role full access" on public.tenants to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.contracts;
create policy "service_role full access" on public.contracts to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.invoices;
create policy "service_role full access" on public.invoices to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.transactions;
create policy "service_role full access" on public.transactions to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.settlement_groups;
create policy "service_role full access" on public.settlement_groups to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.settlement_group_properties;
create policy "service_role full access" on public.settlement_group_properties to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.app_config;
create policy "service_role full access" on public.app_config to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.operation_log;
create policy "service_role full access" on public.operation_log to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.media_settlements;
create policy "service_role full access" on public.media_settlements to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.transaction_staging;
create policy "service_role full access" on public.transaction_staging to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.media_meter_readings;
create policy "service_role full access" on public.media_meter_readings to service_role using (true) with check (true);

drop policy if exists "service_role full access" on public.transaction_amendments;
create policy "service_role full access" on public.transaction_amendments to service_role using (true) with check (true);

-- Tabele dotąd bez RLS (PostgREST wystawiał je dla anon bez żadnych ograniczeń).
alter table public.audit_log enable row level security;
drop policy if exists "service_role full access" on public.audit_log;
create policy "service_role full access" on public.audit_log to service_role using (true) with check (true);

alter table public.email_logs enable row level security;
drop policy if exists "service_role full access" on public.email_logs;
create policy "service_role full access" on public.email_logs to service_role using (true) with check (true);

alter table public.reminder_dedup enable row level security;
drop policy if exists "service_role full access" on public.reminder_dedup;
create policy "service_role full access" on public.reminder_dedup to service_role using (true) with check (true);

-- Asercja: migracja sama dowodzi wyniku.
-- Wyjątek: profiles (polityki auth.uid() = id; dla anon auth.uid() jest null,
-- więc nic nie zwracają).
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Tabele w public bez RLS: %', bad;
  END IF;

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename <> 'profiles'
    AND roles && ARRAY['public', 'anon']::name[];
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Polityki w public otwarte dla public/anon: %', bad;
  END IF;
END $$;
