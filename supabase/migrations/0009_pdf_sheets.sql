-- Konfiguracja which sheets exportować jako PDF (per settlement group)
alter table public.settlement_groups
  add column if not exists pdf_sheets_json jsonb not null default '[]';

-- Zamiana single drive_pdf_id na tablicę PDFów
alter table public.media_settlements
  add column if not exists drive_pdf_ids jsonb not null default '[]';

alter table public.media_settlements
  alter column drive_pdf_id drop not null;
