-- PLAN B - NIE jest częścią supabase/migrations i nie wykona się automatycznie.
-- Cofa 20261012190000_prevent_delete_definer.sql: funkcja wraca do SECURITY INVOKER
-- (definicja z 20260911140000_configurable_delete_protection.sql). Stosować WYŁĄCZNIE
-- jako nową migrację, w razie awarii i za zgodą właściciela.
CREATE OR REPLACE FUNCTION public.prevent_delete_function()
RETURNS TRIGGER AS $body$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.app_config WHERE id = 1 AND allow_destructive_test_deletes = true
    ) THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Usuwanie z % zablokowane. Aby usunac recznie w SQL, wpisz: ALTER TABLE % DISABLE TRIGGER %_trigger; (zrob delete) ALTER TABLE % ENABLE TRIGGER %_trigger;', TG_TABLE_NAME, TG_TABLE_NAME, 'prevent_delete_' || TG_TABLE_NAME, TG_TABLE_NAME, 'prevent_delete_' || TG_TABLE_NAME;
    RETURN NULL;
END;
$body$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.prevent_delete_function() TO PUBLIC;
