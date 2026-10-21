-- PLAN B - NIE jest częścią supabase/migrations i nie wykona się automatycznie.
-- Cofa 20261021110000_storage_per_owner.sql: wraca do czterech polityk "Authenticated users can ... invoices"
-- (cały bucket dla każdego zalogowanego). Stosować WYŁĄCZNIE jako nową migrację, w razie awarii i za zgodą
-- właściciela - RAZEM z cofnięciem kodu aplikacji. Skopiowane obiekty pod <owner_id>/ zostają (nic ich nie usuwa),
-- stare ścieżki bez prefiksu nadal istnieją, bo skrypt kopiujący niczego nie kasuje.

DROP POLICY IF EXISTS "Owner folder select" ON storage.objects;
DROP POLICY IF EXISTS "Owner folder insert" ON storage.objects;
DROP POLICY IF EXISTS "Owner folder update" ON storage.objects;
DROP POLICY IF EXISTS "Owner folder delete" ON storage.objects;

CREATE POLICY "Authenticated users can read invoices" ON storage.objects FOR SELECT TO authenticated
  USING ( bucket_id = 'invoices' );
CREATE POLICY "Authenticated users can insert invoices" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ( bucket_id = 'invoices' );
CREATE POLICY "Authenticated users can update invoices" ON storage.objects FOR UPDATE TO authenticated
  USING ( bucket_id = 'invoices' );
CREATE POLICY "Authenticated users can delete invoices" ON storage.objects FOR DELETE TO authenticated
  USING ( bucket_id = 'invoices' );
