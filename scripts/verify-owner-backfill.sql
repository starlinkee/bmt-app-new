-- Tylko odczyt: stan backfillu owner_id. Bez danych osobowych (poza e-mailem właściciela).
-- Uruchamiać na wybranej bazie, np. psql "$SUPABASE_DB_URL" -f scripts/verify-owner-backfill.sql
SELECT lower(email) AS owner_email FROM auth.users
WHERE id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);

SELECT 'properties' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.properties
UNION ALL
SELECT 'tenants' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.tenants
UNION ALL
SELECT 'contracts' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.contracts
UNION ALL
SELECT 'invoices' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.invoices
UNION ALL
SELECT 'transactions' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.transactions
UNION ALL
SELECT 'transaction_staging' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.transaction_staging
UNION ALL
SELECT 'transaction_amendments' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.transaction_amendments
UNION ALL
SELECT 'settlement_groups' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.settlement_groups
UNION ALL
SELECT 'settlement_group_properties' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.settlement_group_properties
UNION ALL
SELECT 'media_settlements' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.media_settlements
UNION ALL
SELECT 'media_meter_readings' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.media_meter_readings
UNION ALL
SELECT 'operation_log' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.operation_log
UNION ALL
SELECT 'audit_log' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.audit_log
UNION ALL
SELECT 'email_logs' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.email_logs
UNION ALL
SELECT 'reminder_dedup' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.reminder_dedup
UNION ALL
SELECT 'skill_prompts' AS tabela, count(*) AS wierszy, count(*) FILTER (WHERE owner_id IS NULL) AS owner_null, count(*) FILTER (WHERE owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) AS wiersze_wlasciciela FROM public.skill_prompts
ORDER BY 1;
