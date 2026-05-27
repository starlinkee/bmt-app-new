ALTER TABLE invoices
  ADD COLUMN contract_id bigint REFERENCES public.contracts (id) ON DELETE RESTRICT;

ALTER TABLE invoices
  DROP CONSTRAINT invoices_tenant_id_type_month_year_key;

CREATE UNIQUE INDEX invoices_contract_id_type_month_year_key
  ON invoices (contract_id, type, month, year)
  WHERE contract_id IS NOT NULL;
