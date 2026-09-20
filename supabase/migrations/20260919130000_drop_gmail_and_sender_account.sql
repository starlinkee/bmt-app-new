-- Nadawcą maili jest teraz app_config.admin_email, a hasło aplikacji Gmail
-- pochodzi ze zmiennej środowiskowej GMAIL_APP_PASSWORD. Drugie konto nadawcy
-- nie jest już używane.
ALTER TABLE app_config
  DROP COLUMN IF EXISTS gmail_user,
  DROP COLUMN IF EXISTS gmail_app_password,
  DROP COLUMN IF EXISTS gmail_user_2,
  DROP COLUMN IF EXISTS gmail_app_password_2;

ALTER TABLE tenants
  DROP COLUMN IF EXISTS sender_account;
