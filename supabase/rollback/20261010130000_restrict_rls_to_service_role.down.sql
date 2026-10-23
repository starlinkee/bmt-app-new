-- PLAN B - NIE jest częścią supabase/migrations i nie wykona się automatycznie.
-- Przywraca dokładnie poprzedni stan: polityki "service_role full access" bez TO
-- (czyli otwarte dla PUBLIC/anon) oraz brak RLS na audit_log, email_logs, reminder_dedup.
-- Stosować WYŁĄCZNIE jako nową migrację, w razie awarii i za zgodą właściciela -
-- przywraca dziurę (klucz anon daje pełny dostęp do danych).

drop policy if exists "service_role full access" on public.properties;
create policy "service_role full access" on public.properties using (true);

drop policy if exists "service_role full access" on public.tenants;
create policy "service_role full access" on public.tenants using (true);

drop policy if exists "service_role full access" on public.contracts;
create policy "service_role full access" on public.contracts using (true);

drop policy if exists "service_role full access" on public.invoices;
create policy "service_role full access" on public.invoices using (true);

drop policy if exists "service_role full access" on public.transactions;
create policy "service_role full access" on public.transactions using (true);

drop policy if exists "service_role full access" on public.settlement_groups;
create policy "service_role full access" on public.settlement_groups using (true);

drop policy if exists "service_role full access" on public.settlement_group_properties;
create policy "service_role full access" on public.settlement_group_properties using (true);

drop policy if exists "service_role full access" on public.app_config;
create policy "service_role full access" on public.app_config using (true);

drop policy if exists "service_role full access" on public.operation_log;
create policy "service_role full access" on public.operation_log using (true);

drop policy if exists "service_role full access" on public.media_settlements;
create policy "service_role full access" on public.media_settlements using (true);

drop policy if exists "service_role full access" on public.transaction_staging;
create policy "service_role full access" on public.transaction_staging using (true);

drop policy if exists "service_role full access" on public.media_meter_readings;
create policy "service_role full access" on public.media_meter_readings using (true);

drop policy if exists "service_role full access" on public.transaction_amendments;
create policy "service_role full access" on public.transaction_amendments using (true);

drop policy if exists "service_role full access" on public.audit_log;
alter table public.audit_log disable row level security;

drop policy if exists "service_role full access" on public.email_logs;
alter table public.email_logs disable row level security;

drop policy if exists "service_role full access" on public.reminder_dedup;
alter table public.reminder_dedup disable row level security;

