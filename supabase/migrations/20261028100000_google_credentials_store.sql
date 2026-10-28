-- Slice 7a: magazyn poświadczeń Google per konto (bez UI i bez użycia w runtime).
--
-- Dwie tabele (plan: docs/plans/google-per-konto.md, sekcja 5):
--   google_connections - jawny status połączenia; zalogowany użytkownik czyta tylko własny wiersz (SELECT),
--                        zapis wyłącznie rolą service.
--   google_credentials - sekret (zaszyfrowany refresh token, AES-256-GCM w aplikacji, lib/secret-box.ts);
--                        RLS włączony, brak polityk, REVOKE ALL dla anon i authenticated (wzór: legacy_owner).
-- owner_id wskazuje na auth.users bez ON DELETE CASCADE, jak reszta tabel (kolejność sprzątania: tests-support/isolationUsers.ts).
--
-- Plik jest wykonywany w jednej transakcji: dowolny RAISE EXCEPTION cofa całość.
-- Wycofanie: supabase/rollback/20261028100000_google_credentials_store.down.sql

CREATE TABLE public.google_connections (
  owner_id         uuid PRIMARY KEY REFERENCES auth.users (id),
  google_email     text,
  scopes           text[] NOT NULL DEFAULT '{}',
  status           text NOT NULL CHECK (status IN ('connected', 'needs_reauth', 'disconnected')),
  connected_at     timestamptz,
  last_ok_at       timestamptz,
  last_error       text,
  template_file_id text,
  folder_id        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_connections FROM anon, authenticated;
GRANT SELECT ON public.google_connections TO authenticated;

CREATE POLICY "owner read" ON public.google_connections FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

COMMENT ON TABLE public.google_connections IS
  'Status połączenia konta z Google (bez sekretów). Authenticated czyta tylko własny wiersz; zapis tylko service role.';

CREATE TABLE public.google_credentials (
  owner_id         uuid PRIMARY KEY REFERENCES auth.users (id),
  refresh_token_ct bytea NOT NULL,
  iv               bytea NOT NULL,
  key_version      smallint NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  rotated_at       timestamptz
);

ALTER TABLE public.google_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_credentials FROM anon, authenticated;

COMMENT ON TABLE public.google_credentials IS
  'Zaszyfrowany refresh token Google konta (AES-256-GCM, AAD = owner_id). Dostępna tylko dla service role; brak polityk RLS.';

-- Asercja: authenticated i anon nie mają żadnego przywileju na google_credentials; authenticated ma tylko
-- SELECT na google_connections, anon nic; RLS włączony na obu tabelach.
DO $$
DECLARE
  priv text;
  n int;
BEGIN
  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    IF has_table_privilege('authenticated', 'public.google_credentials', priv)
       OR has_table_privilege('anon', 'public.google_credentials', priv) THEN
      RAISE EXCEPTION 'google_credentials: rola użytkownika ma przywilej %', priv;
    END IF;
    IF has_table_privilege('anon', 'public.google_connections', priv) THEN
      RAISE EXCEPTION 'google_connections: anon ma przywilej %', priv;
    END IF;
    IF priv <> 'SELECT' AND has_table_privilege('authenticated', 'public.google_connections', priv) THEN
      RAISE EXCEPTION 'google_connections: authenticated ma przywilej % (dozwolony tylko SELECT)', priv;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated', 'public.google_connections', 'SELECT') THEN
    RAISE EXCEPTION 'google_connections: authenticated nie ma SELECT';
  END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
  WHERE s.nspname = 'public' AND c.relname IN ('google_connections', 'google_credentials') AND c.relrowsecurity;
  IF n <> 2 THEN
    RAISE EXCEPTION 'RLS nie jest włączony na obu tabelach Google (włączony na %)', n;
  END IF;

  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'google_credentials';
  IF n <> 0 THEN
    RAISE EXCEPTION 'google_credentials nie może mieć polityk RLS (jest %)', n;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'google_connections' AND cmd = 'SELECT' AND roles = '{authenticated}';
  IF n <> 1 THEN
    RAISE EXCEPTION 'google_connections: oczekiwano jednej polityki SELECT dla authenticated, jest %', n;
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'google_connections';
  IF n <> 1 THEN
    RAISE EXCEPTION 'google_connections: oczekiwano dokładnie jednej polityki, jest %', n;
  END IF;
END $$;
