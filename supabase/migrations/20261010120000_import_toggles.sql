-- Przełączniki importów wyciągów bankowych w Ustawieniach. Wyłączony import
-- znika z /import, a serwer odrzuca taki import. Domyślnie oba włączone.
-- Pekao = import CSV (slot 0), Millennium = 2 wyciągi PDF (sloty 1/2).
ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS import_pekao_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS import_millennium_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.app_config.import_pekao_enabled IS
  'Czy włączony jest import wyciągu CSV (Pekao) na stronie /import.';

COMMENT ON COLUMN public.app_config.import_millennium_enabled IS
  'Czy włączony jest import 2 wyciągów PDF (Millennium) na stronie /import.';
