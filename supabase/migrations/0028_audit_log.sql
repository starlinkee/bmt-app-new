CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_name text NOT NULL,
  table_name  text,
  operation   text NOT NULL,
  record_id   text,
  before_data jsonb,
  after_data  jsonb,
  error_data  jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX audit_log_created_at_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_table_name_idx ON audit_log(table_name);
CREATE INDEX audit_log_operation_idx  ON audit_log(operation);
