-- Nazwy 2 kont bankowych firmy, konfigurowalne w Ustawieniach (np. gdyby
-- zmienił się bank) — używane jako etykiety przy przypisywaniu najemcy do
-- konta i w kolumnie "ostatni import" w Kontroli płatności.
ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS payment_account_1_name text NOT NULL DEFAULT 'Pekao',
  ADD COLUMN IF NOT EXISTS payment_account_2_name text NOT NULL DEFAULT 'Millennium';

-- Które konto firmowe (1 = Pekao/CSV import slot 0, 2 = Millennium/PDF import
-- slot 1 lub 2) najemca wpłaca czynsz — używane do pokazania daty ostatniego
-- importu dla tego konta w Kontroli płatności. NULL = nieprzypisany.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS payment_account smallint;
