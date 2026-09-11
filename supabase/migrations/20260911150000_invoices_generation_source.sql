-- Śledzenie źródła wygenerowania rachunku/noty w tabeli invoices.
--
-- Kontekst: czynsze (RENT) generuje wyłącznie cron `generate-rents` (patrz
-- lib/rents.ts / app/api/cron/generate-rents/route.ts), który może być
-- wywołany automatycznie przez Vercel Cron albo ręcznie (panel testowy
-- `/testowanie`, lub ręczne wywołanie z sekretem CRON_SECRET). Media (noty
-- obciążeniowe) generuje ręcznie panel `/rozlicz-media`, a osobno panel
-- testowy ma własną, uproszczoną ścieżkę `/testowanie` do generowania
-- testowych obciążeń mediowych. Kolumna `source` zapisuje, która z tych
-- ścieżek utworzyła dany wiersz.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL';

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_source_check
  CHECK (source IN ('CRON', 'MANUAL', 'TEST_MANUAL'));

COMMENT ON COLUMN public.invoices.source IS
  'Źródło wygenerowania wiersza: CRON = automatyczny cron miesięczny, MANUAL = ręczna generacja przez użytkownika (prawdziwa), TEST_MANUAL = ręczna generacja testowa (panel /testowanie).';
