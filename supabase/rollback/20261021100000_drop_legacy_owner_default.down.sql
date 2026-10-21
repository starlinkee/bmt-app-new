-- PLAN B - NIE jest częścią supabase/migrations i nie wykona się automatycznie.
-- Cofa 20261021100000_drop_legacy_owner_default.sql: przywraca fallback do właściciela legacy
-- w current_owner_id() (insert bez sesji znów trafia do konta z legacy_owner). Stosować WYŁĄCZNIE
-- jako nową migrację, w razie awarii i za zgodą właściciela - RAZEM z cofnięciem kodu aplikacji.

CREATE OR REPLACE FUNCTION public.current_owner_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$ SELECT coalesce(auth.uid(), (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) $$;

REVOKE EXECUTE ON FUNCTION public.current_owner_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_owner_id() TO authenticated, service_role;

COMMENT ON TABLE public.legacy_owner IS
  'Jednowierszowa tabela: właściciel danych sprzed wprowadzenia kont. Dostępna tylko dla service role; używana przez current_owner_id() jako domyślny owner_id wierszy tworzonych przez serwer.';
