-- Slice 4a: dedup przypomnień per konto + zachowanie dotychczasowych tekstów e-maili właściciela.
--
-- 1. reminder_dedup: UNIQUE (action_name, dedup_key) -> UNIQUE (owner_id, action_name, dedup_key),
--    żeby dwa konta mogły niezależnie dostać przypomnienie z tym samym kluczem (np. "2026-10").
--    Tabela powstała przed historią migracji z nazwanym constraintem, więc nazwę starego
--    ograniczenia (constraint albo samodzielny unikalny indeks) wyszukujemy dynamicznie.
-- 2. Kod traci firmowe ("BMT") teksty domyślne. Właściciel (legacy_owner) dostaje do bazy DOKŁADNIE
--    te teksty, których dotąd używał jako fallbacku, więc jego e-maile nie zmieniają treści.
--    Dotyczy tylko kolumn NULL (app_config) i NULL/'' (settlement_groups.email_body_template).
DO $$
DECLARE
  v_owner uuid := (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
  v_rows_before bigint := (SELECT count(*) FROM public.reminder_dedup);
  v_rows_after bigint;
  r record;
  v_found int := 0;
  v_nulls int;
BEGIN
  -- 1. Stary unikalny klucz (action_name, dedup_key): constraint typu 'u'...
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.reminder_dedup'::regclass
      AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['action_name', 'dedup_key']
  LOOP
    v_found := v_found + 1;
    EXECUTE format('ALTER TABLE public.reminder_dedup DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- ...albo samodzielny unikalny indeks (bez constraintu) na tych samych kolumnach.
  IF v_found = 0 THEN
    FOR r IN
      SELECT ic.relname AS idxname
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      WHERE i.indrelid = 'public.reminder_dedup'::regclass
        AND i.indisunique AND NOT i.indisprimary
        AND i.indpred IS NULL AND i.indexprs IS NULL
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_attribute a
             WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey::smallint[])) = ARRAY['action_name', 'dedup_key']
    LOOP
      v_found := v_found + 1;
      EXECUTE format('DROP INDEX public.%I', r.idxname);
    END LOOP;
  END IF;

  IF v_found <> 1 THEN
    RAISE EXCEPTION 'reminder_dedup: oczekiwano dokładnie 1 unikalnego klucza (action_name, dedup_key), znaleziono %', v_found;
  END IF;

  ALTER TABLE public.reminder_dedup
    ADD CONSTRAINT reminder_dedup_owner_action_key_key UNIQUE (owner_id, action_name, dedup_key);

  SELECT count(*) INTO v_rows_after FROM public.reminder_dedup;
  IF v_rows_after <> v_rows_before THEN
    RAISE EXCEPTION 'reminder_dedup: zmieniła się liczność wierszy (% -> %)', v_rows_before, v_rows_after;
  END IF;

  -- 2. Szablony właściciela (dotychczasowe fallbacki z kodu, literalnie).
  IF v_owner IS NOT NULL THEN
    UPDATE public.app_config SET rent_email_subject = 'Faktura czynszu {numer_rachunku}'
      WHERE owner_id = v_owner AND rent_email_subject IS NULL;
    UPDATE public.app_config SET rent_email_body = E'Szanowny/a {najemca},\n\nW załączeniu faktura za czynsz nr {numer_rachunku} za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy,\nBMT'
      WHERE owner_id = v_owner AND rent_email_body IS NULL;

    UPDATE public.app_config SET statement_upload_reminder_subject = 'Przypomnienie: wgraj wyciąg z banku'
      WHERE owner_id = v_owner AND statement_upload_reminder_subject IS NULL;
    UPDATE public.app_config SET statement_upload_reminder_body = E'Przypomnienie automatyczne z systemu BMT.\n\nDzisiaj 16. dzień miesiąca — czas wgrać wyciąg z konta bankowego do systemu (sekcja Import).\n\nPozdrawiamy,\nBMT'
      WHERE owner_id = v_owner AND statement_upload_reminder_body IS NULL;

    UPDATE public.app_config SET meter_reading_reminder_subject = 'Przypomnienie: podaj odczyty liczników'
      WHERE owner_id = v_owner AND meter_reading_reminder_subject IS NULL;
    UPDATE public.app_config SET meter_reading_reminder_body = E'Szanowny/a {imie},\n\nDzisiaj ostatni dzień miesiąca — prosimy o podanie odczytów liczników mediów pod poniższym linkiem:\n{link}\n\nPozdrawiamy,\nBMT'
      WHERE owner_id = v_owner AND meter_reading_reminder_body IS NULL;

    -- Grupy rozliczeniowe mediów: fallback e-maila (lib/email sendMediaEmail) bez własnego szablonu.
    UPDATE public.settlement_groups
      SET email_body_template = E'Szanowny/a {imie},\nW załączeniu rozliczenie mediów nr {numer_rachunku} za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy,\nBMT'
      WHERE owner_id = v_owner AND (email_body_template IS NULL OR email_body_template = '');

    SELECT count(*) INTO v_nulls FROM public.app_config
      WHERE owner_id = v_owner AND (
        rent_email_subject IS NULL OR rent_email_body IS NULL
        OR statement_upload_reminder_subject IS NULL OR statement_upload_reminder_body IS NULL
        OR meter_reading_reminder_subject IS NULL OR meter_reading_reminder_body IS NULL);
    IF v_nulls <> 0 THEN
      RAISE EXCEPTION 'app_config właściciela nadal ma puste szablony e-maili (% wierszy)', v_nulls;
    END IF;

    SELECT count(*) INTO v_nulls FROM public.settlement_groups
      WHERE owner_id = v_owner AND (email_body_template IS NULL OR email_body_template = '');
    IF v_nulls <> 0 THEN
      RAISE EXCEPTION 'settlement_groups właściciela nadal ma puste szablony e-maili (% wierszy)', v_nulls;
    END IF;
  END IF;
END $$;
