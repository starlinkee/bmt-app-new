-- Second sender email account in app_config
ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS email_provider_2 text NOT NULL DEFAULT 'gmail_smtp',
  ADD COLUMN IF NOT EXISTS gmail_user_2 text,
  ADD COLUMN IF NOT EXISTS gmail_app_password_2 text;

-- Which sender account to use per tenant (1 or 2)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sender_account smallint NOT NULL DEFAULT 1;
