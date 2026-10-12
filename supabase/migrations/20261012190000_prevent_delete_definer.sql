-- prevent_delete_function() czytała app_config jako WYWOŁUJĄCY. Po ograniczeniu app_config
-- do service_role (20261010130000) rola `authenticated` nie widzi tej tabeli, więc przy
-- DELETE z klienta z sesją flaga allow_destructive_test_deletes była niewidoczna i usuwanie
-- zawsze blokowane - także przy fladze = true. SECURITY DEFINER sprawia, że trigger czyta
-- flagę jako właściciel funkcji. Ciało bez zmian (ścieżka public.app_config jest jawna).
CREATE OR REPLACE FUNCTION public.prevent_delete_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.app_config WHERE id = 1 AND allow_destructive_test_deletes = true
    ) THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Usuwanie z % zablokowane. Aby usunac recznie w SQL, wpisz: ALTER TABLE % DISABLE TRIGGER %_trigger; (zrob delete) ALTER TABLE % ENABLE TRIGGER %_trigger;', TG_TABLE_NAME, TG_TABLE_NAME, 'prevent_delete_' || TG_TABLE_NAME, TG_TABLE_NAME, 'prevent_delete_' || TG_TABLE_NAME;
    RETURN NULL;
END;
$body$;

-- Trigger odpala funkcję niezależnie od uprawnienia EXECUTE wywołującego.
REVOKE EXECUTE ON FUNCTION public.prevent_delete_function() FROM PUBLIC, anon, authenticated;
