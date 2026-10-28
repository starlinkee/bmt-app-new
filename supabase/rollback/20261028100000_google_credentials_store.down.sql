-- PLAN B - NIE jest częścią supabase/migrations i nie wykona się automatycznie.
-- Cofa 20261028100000_google_credentials_store.sql: usuwa obie tabele Google. Kasuje zaszyfrowane tokeny,
-- więc konta muszą połączyć Google od nowa. Stosować WYŁĄCZNIE jako nową migrację, za zgodą właściciela,
-- RAZEM z cofnięciem kodu, który z tych tabel korzysta (od slice 7b).

DROP TABLE IF EXISTS public.google_credentials;
DROP TABLE IF EXISTS public.google_connections;
