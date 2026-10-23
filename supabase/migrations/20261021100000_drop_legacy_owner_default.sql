-- Slice 4b: koniec fallbacku do właściciela "legacy".
--
-- current_owner_id() zwraca teraz samo auth.uid(). Zapis z sesją użytkownika działa jak dotąd
-- (DEFAULT kolumn owner_id = current_owner_id() = id zalogowanego), a insert rolą service bez jawnego
-- owner_id (auth.uid() = NULL) pada na NOT NULL zamiast po cichu trafić do właściciela.
-- DEFAULT-y kolumn zostają bez zmian. Tabela legacy_owner zostaje wyłącznie jako źródło nadawcy
-- e-maili (lib/email.ts) do slice 7.
--
-- Plik jest wykonywany w jednej transakcji: dowolny RAISE EXCEPTION cofa całość.
-- Wycofanie: supabase/rollback/20261021100000_drop_legacy_owner_default.down.sql

CREATE OR REPLACE FUNCTION public.current_owner_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$ SELECT auth.uid() $$;

REVOKE EXECUTE ON FUNCTION public.current_owner_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_owner_id() TO authenticated, service_role;

COMMENT ON TABLE public.legacy_owner IS
  'Jednowierszowa tabela: konto właściciela sprzed wprowadzenia kont. Dostępna tylko dla service role; od slice 4b NIE jest domyślnym owner_id (current_owner_id() = auth.uid()) - zostaje tylko jako źródło nadawcy e-maili (lib/email.ts) do slice 7.';

-- Asercja: w migracji auth.uid() jest NULL (brak sesji), więc insert bez owner_id musi paść na NOT NULL
-- właśnie w kolumnie owner_id. Wiersz nie powstaje, więc trigger prevent_delete nie przeszkadza.
DO $$
DECLARE
  v_column text;
BEGIN
  BEGIN
    INSERT INTO public.properties (name, address1, type)
      VALUES ('E2E_TEST__asercja_migracji_4b', 'ul. Testowa 1', 'Mieszkanie');
  EXCEPTION WHEN not_null_violation THEN
    GET STACKED DIAGNOSTICS v_column = COLUMN_NAME;
    IF v_column IS DISTINCT FROM 'owner_id' THEN
      RAISE EXCEPTION 'Insert bez owner_id padł na złej kolumnie: %', v_column;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Insert bez owner_id powinien paść na NOT NULL (fallback legacy nadal działa)';
END $$;
