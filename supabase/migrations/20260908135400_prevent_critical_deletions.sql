-- Create the generic function to prevent deletions
CREATE OR REPLACE FUNCTION prevent_delete_function()
RETURNS TRIGGER AS $body$
BEGIN
    RAISE EXCEPTION 'Usuwanie z % zablokowane. Aby usunac recznie w SQL, wpisz: ALTER TABLE % DISABLE TRIGGER %_trigger; (zrob delete) ALTER TABLE % ENABLE TRIGGER %_trigger;', TG_TABLE_NAME, TG_TABLE_NAME, 'prevent_delete_' || TG_TABLE_NAME, TG_TABLE_NAME, 'prevent_delete_' || TG_TABLE_NAME;
    RETURN NULL;
END;
$body$ LANGUAGE plpgsql;

-- Add trigger to transactions
DROP TRIGGER IF EXISTS prevent_delete_transactions_trigger ON transactions;
CREATE TRIGGER prevent_delete_transactions_trigger
BEFORE DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION prevent_delete_function();

COMMENT ON TRIGGER prevent_delete_transactions_trigger ON transactions IS 'Blokuje DELETE. Aby usunac, zrob najpierw: ALTER TABLE transactions DISABLE TRIGGER prevent_delete_transactions_trigger;';

-- Add trigger to invoices
DROP TRIGGER IF EXISTS prevent_delete_invoices_trigger ON invoices;
CREATE TRIGGER prevent_delete_invoices_trigger
BEFORE DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION prevent_delete_function();

COMMENT ON TRIGGER prevent_delete_invoices_trigger ON invoices IS 'Blokuje DELETE. Aby usunac, zrob najpierw: ALTER TABLE invoices DISABLE TRIGGER prevent_delete_invoices_trigger;';
