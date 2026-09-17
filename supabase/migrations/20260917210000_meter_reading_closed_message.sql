-- Treść komunikatu pokazywanego najemcy na formularzu odczytów
-- (/odczyty/[token]), gdy okno podawania odczytów jest zamknięte.
-- Celowo nie ujawniamy najemcy dokładnego zakresu dat w domyślnej treści
-- (patrz lib/meter-reading-reminder.ts) — konfigurowalne w Ustawieniach /
-- zakładce Automatyzacje, domyślna wartość (gdy NULL) jest ustawiona w kodzie.
ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS meter_reading_closed_message text;
