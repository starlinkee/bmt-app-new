ALTER TABLE contracts
  DROP COLUMN IF EXISTS invoice_seq_number,
  DROP COLUMN IF EXISTS media_invoice_seq_number;
