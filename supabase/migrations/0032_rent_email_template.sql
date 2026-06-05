ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS rent_email_subject text,
  ADD COLUMN IF NOT EXISTS rent_email_body    text;
