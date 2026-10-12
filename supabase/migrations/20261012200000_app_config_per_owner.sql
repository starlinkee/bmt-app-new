-- Slice 3: app_config per konto (PK owner_id), ustawienia środowiska testowego osobno
-- (system_settings), neutralny wiersz ustawień dla nowych kont, skill_prompts per konto.
--
-- Plik wykonuje się w jednej transakcji: dowolny RAISE EXCEPTION cofa całość.
-- Kod aplikacji i ta migracja MUSZĄ wejść w jednym deployu (po migracji kolumna `id`
-- w app_config nie istnieje). Wycofanie: supabase/rollback/20261012200000_app_config_per_owner.down.sql

-- a. Snapshoty przed zmianą.
CREATE TEMP TABLE _ac_snapshot ON COMMIT DROP AS SELECT * FROM public.app_config WHERE id = 1;
CREATE TEMP TABLE _sp_count ON COMMIT DROP AS SELECT count(*)::bigint AS n FROM public.skill_prompts;

DO $$
BEGIN
  IF (SELECT count(*) FROM _ac_snapshot) <> 1 THEN
    RAISE EXCEPTION 'app_config nie ma dokładnie jednego wiersza id = 1';
  END IF;
END $$;

-- b. system_settings: ustawienia ŚRODOWISKA (crony i trigger je czytają), nie konta.
CREATE TABLE public.system_settings (
  id                             int     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  time_offset_ms                 bigint  NOT NULL DEFAULT 0,
  allow_destructive_test_deletes boolean NOT NULL DEFAULT false
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_settings FROM anon, authenticated;
CREATE POLICY "service_role full access" ON public.system_settings
  TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.system_settings (id, time_offset_ms, allow_destructive_test_deletes)
  SELECT 1, time_offset_ms, allow_destructive_test_deletes FROM _ac_snapshot;

COMMENT ON TABLE public.system_settings IS
  'Jednowierszowe ustawienia środowiska (zegar testowy, zgoda na niszczące usuwanie) - globalne, nie per konto. Tylko service role.';

ALTER TABLE public.app_config
  DROP COLUMN time_offset_ms,
  DROP COLUMN allow_destructive_test_deletes;

-- c. Trigger blokujący DELETE czyta flagę z system_settings.
CREATE OR REPLACE FUNCTION public.prevent_delete_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.system_settings WHERE id = 1 AND allow_destructive_test_deletes = true
    ) THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Usuwanie z % zablokowane. Aby usunac recznie w SQL, wpisz: ALTER TABLE % DISABLE TRIGGER %_trigger; (zrob delete) ALTER TABLE % ENABLE TRIGGER %_trigger;', TG_TABLE_NAME, TG_TABLE_NAME, 'prevent_delete_' || TG_TABLE_NAME, TG_TABLE_NAME, 'prevent_delete_' || TG_TABLE_NAME;
    RETURN NULL;
END;
$body$;

-- d. app_config: klucz główny owner_id zamiast id = 1.
ALTER TABLE public.app_config ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.app_config SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1) WHERE id = 1;
ALTER TABLE public.app_config ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.app_config DROP CONSTRAINT single_row;
DO $pk$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.app_config'::regclass AND contype = 'p';
  EXECUTE format('ALTER TABLE public.app_config DROP CONSTRAINT %I', c);
END $pk$;
ALTER TABLE public.app_config DROP COLUMN id;
ALTER TABLE public.app_config ADD PRIMARY KEY (owner_id);
ALTER TABLE public.app_config ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();

-- e. Neutralne defaulty (bez nazwy firmy). Wiersz właściciela się nie zmienia - zmieniają się
-- tylko wartości domyślne dla NOWYCH wierszy.
ALTER TABLE public.app_config
  ALTER COLUMN reminder_body SET DEFAULT E'Szanowny/a {imie},\n\nPrzypominamy o płatności czynszu za {miesiac}/{rok} w kwocie {kwota} zł.\n\nPozdrawiamy',
  ALTER COLUMN late_reminder_subject SET DEFAULT 'Rozliczenie wpłat i rachunków',
  ALTER COLUMN late_reminder_body SET DEFAULT E'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy';

-- f. Każde istniejące konto bez wiersza dostaje neutralny wiersz (konto właściciela ma już swój).
INSERT INTO public.app_config (owner_id)
  SELECT u.id FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.app_config c WHERE c.owner_id = u.id);

-- g. Nowe konto = nowy wiersz ustawień (obok profilu).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.app_config (owner_id) VALUES (new.id) ON CONFLICT DO NOTHING;
  RETURN new;
END;
$$;

-- h. Polityki: service_role bez zmian, authenticated widzi i zmienia tylko własny wiersz.
CREATE POLICY "owner access" ON public.app_config FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

-- i. skill_prompts: identyfikator promptu unikalny w obrębie konta.
DO $pk$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.skill_prompts'::regclass AND contype = 'p';
  EXECUTE format('ALTER TABLE public.skill_prompts DROP CONSTRAINT %I', c);
END $pk$;
ALTER TABLE public.skill_prompts ADD PRIMARY KEY (owner_id, id);

-- j. Asercje: migracja sama dowodzi wyniku.
DO $$
DECLARE
  v_owner uuid;
  n bigint;
  keys text[] := ARRAY['id', 'owner_id', 'time_offset_ms', 'allow_destructive_test_deletes'];
  snap jsonb;
  cur jsonb;
  names text;
BEGIN
  SELECT owner_id INTO v_owner FROM public.legacy_owner WHERE id = 1;

  -- wiersz właściciela == snapshot (poza kluczami technicznymi i dwiema przeniesionymi kolumnami)
  SELECT to_jsonb(s) - keys INTO snap FROM _ac_snapshot s;
  SELECT to_jsonb(c) - keys INTO cur FROM public.app_config c WHERE c.owner_id = v_owner;
  IF cur IS NULL OR cur IS DISTINCT FROM snap THEN
    RAISE EXCEPTION 'Wiersz app_config właściciela różni się od snapshotu: % <> %', cur, snap;
  END IF;

  -- dokładnie jeden wiersz na każde konto, brak wierszy bez konta
  SELECT count(*) INTO n FROM auth.users u
    WHERE (SELECT count(*) FROM public.app_config c WHERE c.owner_id = u.id) <> 1;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Konta bez dokładnie jednego wiersza app_config: %', n;
  END IF;
  SELECT count(*) INTO n FROM public.app_config WHERE owner_id NOT IN (SELECT id FROM auth.users);
  IF n <> 0 THEN
    RAISE EXCEPTION 'Wiersze app_config bez konta: %', n;
  END IF;
  SELECT count(*) INTO n FROM public.app_config WHERE owner_id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Wiersze app_config z owner_id NULL: %', n;
  END IF;

  -- skill_prompts: liczność bez zmian
  SELECT count(*) INTO n FROM public.skill_prompts;
  IF n <> (SELECT s.n FROM _sp_count s) THEN
    RAISE EXCEPTION 'Zmieniona liczność skill_prompts: było %, jest %', (SELECT s.n FROM _sp_count s), n;
  END IF;

  -- system_settings: 1 wiersz z wartościami sprzed migracji
  SELECT count(*) INTO n FROM public.system_settings s, _ac_snapshot a
    WHERE s.id = 1 AND s.time_offset_ms = a.time_offset_ms
      AND s.allow_destructive_test_deletes = a.allow_destructive_test_deletes;
  IF n <> 1 OR (SELECT count(*) FROM public.system_settings) <> 1 THEN
    RAISE EXCEPTION 'system_settings nie zawiera dokładnie jednego wiersza z wartościami sprzed migracji';
  END IF;

  -- brak firmowych defaultów w app_config
  SELECT string_agg(column_name, ', ') INTO names FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_config' AND column_default ILIKE '%BMT%';
  IF names IS NOT NULL THEN
    RAISE EXCEPTION 'Kolumny app_config nadal z firmowym defaultem (BMT): %', names;
  END IF;
END $$;
