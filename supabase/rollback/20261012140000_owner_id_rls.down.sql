-- PLAN B - NIE jest częścią supabase/migrations i nie wykona się automatycznie.
-- Cofa 20261012140000_owner_id_rls.sql: polityki "owner access", indeksy i kolumny
-- owner_id, funkcję current_owner_id() i tabelę legacy_owner. Danych nie traci
-- (owner_id to tylko dodana kolumna). Stosować WYŁĄCZNIE jako nową migrację,
-- w razie awarii i za zgodą właściciela.

DROP POLICY IF EXISTS "owner access" ON public.properties;
DROP POLICY IF EXISTS "owner access" ON public.tenants;
DROP POLICY IF EXISTS "owner access" ON public.contracts;
DROP POLICY IF EXISTS "owner access" ON public.invoices;
DROP POLICY IF EXISTS "owner access" ON public.transactions;
DROP POLICY IF EXISTS "owner access" ON public.transaction_staging;
DROP POLICY IF EXISTS "owner access" ON public.transaction_amendments;
DROP POLICY IF EXISTS "owner access" ON public.settlement_groups;
DROP POLICY IF EXISTS "owner access" ON public.settlement_group_properties;
DROP POLICY IF EXISTS "owner access" ON public.media_settlements;
DROP POLICY IF EXISTS "owner access" ON public.media_meter_readings;
DROP POLICY IF EXISTS "owner access" ON public.operation_log;
DROP POLICY IF EXISTS "owner access" ON public.audit_log;
DROP POLICY IF EXISTS "owner access" ON public.email_logs;
DROP POLICY IF EXISTS "owner access" ON public.reminder_dedup;
DROP POLICY IF EXISTS "owner access" ON public.skill_prompts;

-- Przywrócenie dawnej polityki skill_prompts.
CREATE POLICY "Authenticated users can manage skill_prompts" ON public.skill_prompts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP INDEX IF EXISTS public.properties_owner_id_idx;
ALTER TABLE public.properties DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.tenants_owner_id_idx;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.contracts_owner_id_idx;
ALTER TABLE public.contracts DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.invoices_owner_id_idx;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.transactions_owner_id_idx;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.transaction_staging_owner_id_idx;
ALTER TABLE public.transaction_staging DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.transaction_amendments_owner_id_idx;
ALTER TABLE public.transaction_amendments DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.settlement_groups_owner_id_idx;
ALTER TABLE public.settlement_groups DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.settlement_group_properties_owner_id_idx;
ALTER TABLE public.settlement_group_properties DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.media_settlements_owner_id_idx;
ALTER TABLE public.media_settlements DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.media_meter_readings_owner_id_idx;
ALTER TABLE public.media_meter_readings DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.operation_log_owner_id_idx;
ALTER TABLE public.operation_log DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.audit_log_owner_id_idx;
ALTER TABLE public.audit_log DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.email_logs_owner_id_idx;
ALTER TABLE public.email_logs DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.reminder_dedup_owner_id_idx;
ALTER TABLE public.reminder_dedup DROP COLUMN IF EXISTS owner_id;
DROP INDEX IF EXISTS public.skill_prompts_owner_id_idx;
ALTER TABLE public.skill_prompts DROP COLUMN IF EXISTS owner_id;

DROP FUNCTION IF EXISTS public.current_owner_id();
DROP TABLE IF EXISTS public.legacy_owner;
