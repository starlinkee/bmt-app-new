-- Zakładka "Rozlicz w przeszłości" (/rozlicz-w-przeszlosci) - ręczne
-- dopisywanie zaległych czynszów (RENT) za wybrany zakres miesięcy wstecz.
--
-- To niebezpieczna operacja (tworzy obciążenia, które wpływają na saldo
-- najemców), więc zakładka jest domyślnie UKRYTA i trzeba ją świadomie
-- włączyć w Ustawieniach.
ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS backfill_rents_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_config.backfill_rents_enabled IS
  'Czy w menu ma być widoczna zakładka "Rozlicz w przeszłości" (wsteczne generowanie czynszów).';

-- Osobne źródło dla czynszów dopisanych wstecznie, żeby dało się je później
-- odróżnić od tych z crona / ręcznej generacji.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_source_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_source_check
  CHECK (source IN ('CRON', 'MANUAL', 'TEST_MANUAL', 'BACKFILL'));

COMMENT ON COLUMN public.invoices.source IS
  'Źródło wygenerowania wiersza: CRON = automatyczny cron miesięczny, MANUAL = ręczna generacja przez użytkownika (prawdziwa), TEST_MANUAL = ręczna generacja testowa (panel /testowanie), BACKFILL = wsteczne dopisanie czynszów (zakładka /rozlicz-w-przeszlosci).';
