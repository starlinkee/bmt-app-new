-- Powiązanie transaction_staging i transactions z konkretnym importem
-- (wierszem audit_log akcji importBankStatement), żeby historia importów
-- mogła pokazywać rzeczywisty, aktualny status pliku (do zatwierdzenia /
-- zatwierdzono / odrzucono), a nie zamrożony zrzut liczb z chwili wgrania.

alter table public.transaction_staging
  add column if not exists import_id bigint references public.audit_log (id) on delete set null;

alter table public.transactions
  add column if not exists import_id bigint references public.audit_log (id) on delete set null;

create index if not exists transaction_staging_import_id_idx on public.transaction_staging (import_id);
create index if not exists transactions_import_id_idx on public.transactions (import_id);
