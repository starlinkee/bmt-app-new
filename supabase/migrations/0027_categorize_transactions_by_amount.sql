-- Ustaw kategorię transakcji na podstawie porównania kwoty z czynszem z umowy najemcy.
-- RENT  → kwota transakcji == kwota czynszu z umowy
-- MEDIA → kwota transakcji != kwota czynszu z umowy
-- Dotyczy tylko transakcji bez kategorii (category IS NULL) przypisanych do najemcy.
-- Najemcy bez żadnej umowy są pomijani (category zostaje NULL).

UPDATE transactions t
SET category = CASE
  WHEN t.amount = c.rent_amount THEN 'RENT'
  ELSE 'MEDIA'
END
FROM (
  -- Dla każdego najemcy: preferuj aktywną umowę, potem ostatnią po dacie
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    rent_amount
  FROM contracts
  ORDER BY tenant_id, is_active DESC, start_date DESC
) c
WHERE t.tenant_id = c.tenant_id
  AND t.tenant_id IS NOT NULL
  AND t.category IS NULL;
