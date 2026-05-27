ALTER TABLE contracts
  ADD COLUMN has_media_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN media_invoice_seq_number integer NULL;
