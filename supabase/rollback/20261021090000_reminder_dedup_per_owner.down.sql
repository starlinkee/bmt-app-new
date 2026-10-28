-- PLAN B - NIE jest częścią supabase/migrations i nie wykona się automatycznie.
-- Cofa 20261021090000_reminder_dedup_per_owner.sql. Stosować WYŁĄCZNIE jako nową migrację,
-- w razie awarii i za zgodą właściciela - RAZEM z cofnięciem kodu aplikacji.
--
-- UWAGA:
--  * Powrót do UNIQUE (action_name, dedup_key) zadziała tylko, jeśli żadne dwa konta nie mają
--    wpisów z tym samym (action_name, dedup_key); przy kolizji ALTER przerwie się błędem
--    (wtedy najpierw usunąć duplikaty - to tylko znaczniki "już wysłano").
--  * Szablony e-maili właściciela wypełnione przez migrację ZOSTAJĄ (to dokładnie jego dotychczasowe
--    teksty z kodu - ich cofnięcie zmieniłoby treść e-maili po powrocie do starego kodu).

ALTER TABLE public.reminder_dedup DROP CONSTRAINT IF EXISTS reminder_dedup_owner_action_key_key;
ALTER TABLE public.reminder_dedup ADD CONSTRAINT reminder_dedup_action_name_dedup_key_key UNIQUE (action_name, dedup_key);
