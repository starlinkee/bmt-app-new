ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS email_provider text NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS gmail_user text,
  ADD COLUMN IF NOT EXISTS gmail_app_password text;
