alter table public.settlement_groups
  add column if not exists media_invoice_spreadsheet_id text not null default '',
  add column if not exists media_invoice_input_mapping_json jsonb not null default '[]';
