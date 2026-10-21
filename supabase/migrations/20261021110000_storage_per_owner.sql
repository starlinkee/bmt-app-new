-- Slice 5: pliki Storage per konto.
--
-- Pliki w bucketach 'invoices' i 'manual-uploads' leżą pod prefiksem <owner_id>/ (lib/storage-paths.ts).
-- Zalogowany użytkownik (rola authenticated) widzi i zmienia wyłącznie obiekty ze swojego folderu:
-- (storage.foldername(name))[1] = auth.uid(). Stare cztery polityki "Authenticated users can ... invoices"
-- dawały każdemu zalogowanemu cały bucket - zastępujemy je. Service role omija polityki (trasy
-- sprawdzają prefiks jawnie, patrz isOwnedPath).
--
-- Istniejące obiekty kopiuje scripts/storage-copy-to-owner.mjs (stare NIE są usuwane); do czasu
-- skopiowania zalogowany użytkownik nie widzi starych ścieżek bez prefiksu przez klienta sesji.
--
-- Plik jest wykonywany w jednej transakcji: dowolny RAISE EXCEPTION cofa całość.
-- Wycofanie: supabase/rollback/20261021110000_storage_per_owner.down.sql

DROP POLICY IF EXISTS "Authenticated users can read invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON storage.objects;

CREATE POLICY "Owner folder select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('invoices', 'manual-uploads') AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Owner folder insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('invoices', 'manual-uploads') AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Owner folder update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('invoices', 'manual-uploads') AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id IN ('invoices', 'manual-uploads') AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Owner folder delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('invoices', 'manual-uploads') AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- Asercja: każda polityka na storage.objects dotykająca tych bucketów zawęża do folderu konta,
-- a stare polityki "Authenticated users can ..." zniknęły.
DO $$
DECLARE
  bad text;
  n int;
BEGIN
  SELECT string_agg(policyname, ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(invoices|manual-uploads)'
    AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%foldername%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Polityki storage bez zawężenia do folderu konta: %', bad;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'Authenticated users can % invoices';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Stare polityki invoices nadal istnieją (%)', n;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'Owner folder %';
  IF n <> 4 THEN
    RAISE EXCEPTION 'Oczekiwano 4 polityk "Owner folder", jest %', n;
  END IF;
END $$;
