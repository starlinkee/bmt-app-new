-- Dzień w miesiącu, na którym domyślnie "przecina się" okres wyciągu
-- (np. 15 -> zakres sugerowany dla dokumentu to 16. dnia poprzedniego
-- miesiąca do 15. dnia bieżącego). Używane do podpowiadania zakresu dni
-- przy imporcie wyciągów (CSV oraz PDF). Konfigurowalne w Ustawieniach,
-- bo w praktyce może się różnić od 15.
ALTER TABLE app_config
ADD COLUMN statement_cutoff_day INTEGER NOT NULL DEFAULT 15;
