-- Pozwala WŁĄCZYĆ usuwanie z transactions/invoices (domyślnie zablokowane
-- triggerem z 20260908135400_prevent_critical_deletions.sql) per-baza, bez
-- usuwania samego triggera i bez ręcznych zmian schematu poza migracjami
-- (patrz AGENTS.md - "Zasady zmian schematu bazy danych").
--
-- Domyślna wartość to false, czyli dokładnie takie samo pełne zablokowanie
-- DELETE jak dotychczas - każda baza (łącznie z produkcyjną) jest zablokowana
-- od razu po zaaplikowaniu tej migracji, bez żadnego dodatkowego kroku.
--
-- Odblokowanie (ustawienie na true) wykonuje WYŁĄCZNIE kod aplikacji, który
-- sam jest zablokowany na produkcji - patrz isTestClockAllowed() w lib/clock.ts
-- oraz zeroAllTenantBalances() w app/(dashboard)/testowanie/actions.ts. Dzięki
-- temu prawdziwa produkcja nie ma jak dostać tej flagi ustawionej na true przez
-- samą aplikację; dev/preview mogą ją sobie ustawić trwale przez panel testowy.
ALTER TABLE public.app_config
ADD COLUMN IF NOT EXISTS allow_destructive_test_deletes boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION prevent_delete_function()
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
