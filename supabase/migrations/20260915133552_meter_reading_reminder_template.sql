-- Temat i treść maila przypominającego o podaniu odczytów liczników,
-- wysyłanego w ostatnim dniu każdego miesiąca do najemców, którzy mają
-- przypisane klucze odczytów (tenant_reading_keys) w swojej grupie
-- rozliczeniowej. Konfigurowalne w Ustawieniach, domyślne wartości
-- (gdy NULL) są ustawione w kodzie (lib/email.ts).
ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS meter_reading_reminder_subject text,
  ADD COLUMN IF NOT EXISTS meter_reading_reminder_body    text;
