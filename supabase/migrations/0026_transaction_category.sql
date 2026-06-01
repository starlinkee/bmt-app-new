ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('RENT', 'MEDIA'));
ALTER TABLE transaction_staging ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('RENT', 'MEDIA'));

-- Ustaw istniejące transakcje jako RENT tam, gdzie najemca nie ma żadnego kontraktu z media_invoice
UPDATE transactions t
SET category = 'RENT'
WHERE t.tenant_id IS NOT NULL
  AND category IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM contracts c
    WHERE c.tenant_id = t.tenant_id
      AND c.has_media_invoice = true
  );
