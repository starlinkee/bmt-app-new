CREATE TABLE email_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_email    text NOT NULL,
  subject     text NOT NULL,
  body        text,
  sent_at     timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX email_logs_sent_at_idx ON email_logs(sent_at DESC);
