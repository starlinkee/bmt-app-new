-- PLAN B - NIE jest częścią supabase/migrations i nie wykona się automatycznie.
-- Cofa 20261012200000_app_config_per_owner.sql. Stosować WYŁĄCZNIE jako nową migrację,
-- w razie awarii i za zgodą właściciela - RAZEM z cofnięciem kodu aplikacji.
--
-- UWAGA (utrata danych, świadoma):
--  * app_config wraca do jednego wiersza (id = 1 = wiersz właściciela z legacy_owner). Wiersze
--    pozostałych kont (neutralne, utworzone automatycznie) są USUWANE - jeśli ktoś zdążył je
--    zmienić, te ustawienia przepadają.
--  * PK skill_prompts wraca do (id): zadziała tylko, jeśli id są unikalne między kontami; przy
--    kolizji ALTER przerwie się błędem (wtedy najpierw trzeba usunąć/zmienić duplikaty).
--  * Defaulty kolumn wracają do wersji z nazwą firmy.

-- app_config: zostaje wyłącznie wiersz właściciela.
DELETE FROM public.app_config WHERE owner_id <> (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
DROP POLICY IF EXISTS "owner access" ON public.app_config;
DO $pk$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.app_config'::regclass AND contype = 'p';
  EXECUTE format('ALTER TABLE public.app_config DROP CONSTRAINT %I', c);
END $pk$;
ALTER TABLE public.app_config ADD COLUMN id int NOT NULL DEFAULT 1;
ALTER TABLE public.app_config ADD PRIMARY KEY (id);
ALTER TABLE public.app_config ADD CONSTRAINT single_row CHECK (id = 1);
ALTER TABLE public.app_config DROP COLUMN owner_id;

-- kolumny testowe wracają z system_settings.
ALTER TABLE public.app_config
  ADD COLUMN time_offset_ms BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN allow_destructive_test_deletes boolean NOT NULL DEFAULT false;
UPDATE public.app_config a
  SET time_offset_ms = s.time_offset_ms, allow_destructive_test_deletes = s.allow_destructive_test_deletes
  FROM public.system_settings s WHERE s.id = 1;

-- poprzednie defaulty (z nazwą firmy).
ALTER TABLE public.app_config
  ALTER COLUMN reminder_body SET DEFAULT E'Szanowny/a {imie},\n\nPrzypominamy o płatności czynszu za {miesiac}/{rok} w kwocie {kwota} zł.\n\nPozdrawiamy,\nBMT',
  ALTER COLUMN late_reminder_subject SET DEFAULT 'Rozliczenie wpłat i rachunków - BMT',
  ALTER COLUMN late_reminder_body SET DEFAULT E'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT';

-- trigger usuwania czyta flagę z app_config (wersja z 20261012190000).
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

DROP TABLE public.system_settings;

-- handle_new_user bez wiersza app_config (wersja z 0001_profiles.sql).
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
  RETURN new;
END;
$$;

-- skill_prompts: PK znów (id).
DO $pk$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid = 'public.skill_prompts'::regclass AND contype = 'p';
  EXECUTE format('ALTER TABLE public.skill_prompts DROP CONSTRAINT %I', c);
END $pk$;
ALTER TABLE public.skill_prompts ADD PRIMARY KEY (id);
