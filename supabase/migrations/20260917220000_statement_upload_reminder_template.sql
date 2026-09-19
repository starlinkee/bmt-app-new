-- Temat i treść maila przypominającego administratorowi o wgraniu wyciągu
-- bankowego, wysyłanego 16. dnia każdego miesiąca. Konfigurowalne w
-- Automatyzacjach, domyślne wartości (gdy NULL) są ustawione w kodzie
-- (lib/email.ts).
ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS statement_upload_reminder_subject text,
  ADD COLUMN IF NOT EXISTS statement_upload_reminder_body    text;
