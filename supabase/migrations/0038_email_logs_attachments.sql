ALTER TABLE email_logs ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
