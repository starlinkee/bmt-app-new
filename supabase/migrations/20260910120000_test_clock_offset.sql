-- Przesunięcie "wirtualnego zegara" (w milisekundach) używane wyłącznie do
-- testowania automatyzacji (crony) poza produkcją. Efektywny czas serwera to
-- zawsze `Date.now() + time_offset_ms` (patrz lib/clock.ts) - czas płynie
-- normalnie, tylko przesunięty względem realnego, dzięki czemu można
-- np. przewinąć zegar na 16. dzień miesiąca i sprawdzić, czy cron się odpali.
-- Odczyt/zapis tej kolumny jest w kodzie dodatkowo zablokowany na produkcji
-- (poza NEXT_PUBLIC_ALLOW_TEST_PANEL=true), więc domyślne 0 nigdy nie powinno
-- się zmienić na prawdziwej produkcji.
ALTER TABLE app_config
ADD COLUMN time_offset_ms BIGINT NOT NULL DEFAULT 0;
