-- Slice 1: owner_id + backfill właściciela + RLS per konto.
--
-- Każda tabela z danymi dostaje owner_id uuid not null (konto bmt.nieruchomosci@gmail.com),
-- a rola authenticated widzi/zmienia wyłącznie własne wiersze. Kod aplikacji używa service
-- role (omija RLS), więc jego zachowanie się nie zmienia - nowe wiersze dostają właściciela
-- z DEFAULT public.current_owner_id() (auth.uid() albo właściciel "legacy" dla service role).
--
-- Plik jest wykonywany w jednej transakcji: dowolny RAISE EXCEPTION cofa całość.
-- Wycofanie: supabase/rollback/20261012140000_owner_id_rls.down.sql

-- a/b. Właściciel jawnie (bez fallbacku) i tabela legacy_owner.
DO $$
DECLARE
  n int;
  v_owner uuid;
BEGIN
  SELECT count(*) INTO n FROM auth.users WHERE lower(email) = 'bmt.nieruchomosci@gmail.com';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Brak konta właściciela bmt.nieruchomosci@gmail.com (znaleziono: %)', n;
  END IF;
  SELECT id INTO v_owner FROM auth.users WHERE lower(email) = 'bmt.nieruchomosci@gmail.com';

  CREATE TABLE public.legacy_owner (
    id       int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    owner_id uuid NOT NULL REFERENCES auth.users (id)
  );
  ALTER TABLE public.legacy_owner ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.legacy_owner FROM anon, authenticated;
  INSERT INTO public.legacy_owner (id, owner_id) VALUES (1, v_owner);
END $$;

COMMENT ON TABLE public.legacy_owner IS
  'Jednowierszowa tabela: właściciel danych sprzed wprowadzenia kont. Dostępna tylko dla service role; używana przez current_owner_id() jako domyślny owner_id wierszy tworzonych przez serwer.';

-- c. Domyślny właściciel nowych wierszy.
CREATE FUNCTION public.current_owner_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$ SELECT coalesce(auth.uid(), (SELECT owner_id FROM public.legacy_owner WHERE id = 1)) $$;

REVOKE EXECUTE ON FUNCTION public.current_owner_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_owner_id() TO authenticated, service_role;

-- d. Snapshot liczności przed zmianą.
CREATE TEMP TABLE _counts (t text PRIMARY KEY, n bigint NOT NULL) ON COMMIT DROP;
DO $$
DECLARE t text; c bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties', 'tenants', 'contracts', 'invoices', 'transactions', 'transaction_staging', 'transaction_amendments', 'settlement_groups', 'settlement_group_properties', 'media_settlements', 'media_meter_readings', 'operation_log', 'audit_log', 'email_logs', 'reminder_dedup', 'skill_prompts'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO c;
    INSERT INTO _counts VALUES (t, c);
  END LOOP;
END $$;

-- e. Kolumna owner_id, backfill, default, NOT NULL, indeks (bez ON DELETE CASCADE -
-- usunięcie konta nie kasuje danych).
ALTER TABLE public.properties ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.properties SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.properties ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.properties ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX properties_owner_id_idx ON public.properties (owner_id);

ALTER TABLE public.tenants ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.tenants SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.tenants ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.tenants ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX tenants_owner_id_idx ON public.tenants (owner_id);

ALTER TABLE public.contracts ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.contracts SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.contracts ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.contracts ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX contracts_owner_id_idx ON public.contracts (owner_id);

ALTER TABLE public.invoices ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.invoices SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.invoices ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.invoices ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX invoices_owner_id_idx ON public.invoices (owner_id);

ALTER TABLE public.transactions ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.transactions SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.transactions ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.transactions ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX transactions_owner_id_idx ON public.transactions (owner_id);

ALTER TABLE public.transaction_staging ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.transaction_staging SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.transaction_staging ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.transaction_staging ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX transaction_staging_owner_id_idx ON public.transaction_staging (owner_id);

ALTER TABLE public.transaction_amendments ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.transaction_amendments SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.transaction_amendments ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.transaction_amendments ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX transaction_amendments_owner_id_idx ON public.transaction_amendments (owner_id);

ALTER TABLE public.settlement_groups ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.settlement_groups SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.settlement_groups ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.settlement_groups ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX settlement_groups_owner_id_idx ON public.settlement_groups (owner_id);

ALTER TABLE public.settlement_group_properties ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.settlement_group_properties SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.settlement_group_properties ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.settlement_group_properties ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX settlement_group_properties_owner_id_idx ON public.settlement_group_properties (owner_id);

ALTER TABLE public.media_settlements ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.media_settlements SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.media_settlements ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.media_settlements ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX media_settlements_owner_id_idx ON public.media_settlements (owner_id);

ALTER TABLE public.media_meter_readings ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.media_meter_readings SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.media_meter_readings ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.media_meter_readings ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX media_meter_readings_owner_id_idx ON public.media_meter_readings (owner_id);

ALTER TABLE public.operation_log ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.operation_log SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.operation_log ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.operation_log ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX operation_log_owner_id_idx ON public.operation_log (owner_id);

ALTER TABLE public.audit_log ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.audit_log SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.audit_log ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.audit_log ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX audit_log_owner_id_idx ON public.audit_log (owner_id);

ALTER TABLE public.email_logs ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.email_logs SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.email_logs ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.email_logs ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX email_logs_owner_id_idx ON public.email_logs (owner_id);

ALTER TABLE public.reminder_dedup ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.reminder_dedup SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.reminder_dedup ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.reminder_dedup ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX reminder_dedup_owner_id_idx ON public.reminder_dedup (owner_id);

ALTER TABLE public.skill_prompts ADD COLUMN owner_id uuid REFERENCES auth.users (id);
UPDATE public.skill_prompts SET owner_id = (SELECT owner_id FROM public.legacy_owner WHERE id = 1);
ALTER TABLE public.skill_prompts ALTER COLUMN owner_id SET DEFAULT public.current_owner_id();
ALTER TABLE public.skill_prompts ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX skill_prompts_owner_id_idx ON public.skill_prompts (owner_id);

-- f. Polityki: authenticated widzi i zmienia tylko własne wiersze.
CREATE POLICY "owner access" ON public.properties FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.tenants FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.contracts FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.invoices FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.transactions FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.transaction_staging FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.transaction_amendments FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.settlement_groups FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.settlement_group_properties FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.media_settlements FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.media_meter_readings FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.operation_log FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.audit_log FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.email_logs FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.reminder_dedup FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "owner access" ON public.skill_prompts FOR ALL TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY "Authenticated users can manage skill_prompts" ON public.skill_prompts;

-- g. Asercje: migracja sama dowodzi wyniku.
DO $$
DECLARE
  t text; c bigint; before_n bigint; bad bigint; v_owner uuid; names text;
BEGIN
  SELECT owner_id INTO v_owner FROM public.legacy_owner WHERE id = 1;

  FOR t, before_n IN SELECT _counts.t, _counts.n FROM _counts LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO c;
    IF c <> before_n THEN
      RAISE EXCEPTION 'Zmieniona liczność %: było %, jest %', t, before_n, c;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE owner_id IS NULL OR owner_id <> $1', t) INTO bad USING v_owner;
    IF bad <> 0 THEN
      RAISE EXCEPTION 'Tabela %: % wierszy bez właściciela lub z innym właścicielem', t, bad;
    END IF;
  END LOOP;

  -- Tabele utworzone poza migracjami (lub nowe) bez owner_id: zgłosić, nie dopisywać po cichu.
  SELECT string_agg(c.relname, ', ') INTO names
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND c.relname NOT IN ('app_config', 'profiles', 'legacy_owner')
    AND NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'owner_id' AND NOT a.attisdropped
    );
  IF names IS NOT NULL THEN
    RAISE EXCEPTION 'Tabele w public bez kolumny owner_id: %', names;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO names
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  IF names IS NOT NULL THEN
    RAISE EXCEPTION 'Tabele w public bez RLS: %', names;
  END IF;

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO names
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename <> 'profiles'
    AND roles && ARRAY['public', 'anon']::name[];
  IF names IS NOT NULL THEN
    RAISE EXCEPTION 'Polityki w public otwarte dla public/anon: %', names;
  END IF;

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO names
  FROM pg_policies
  WHERE schemaname = 'public' AND roles && ARRAY['authenticated']::name[] AND qual = 'true';
  IF names IS NOT NULL THEN
    RAISE EXCEPTION 'Polityki dla authenticated bez ograniczenia (qual = true): %', names;
  END IF;
END $$;
