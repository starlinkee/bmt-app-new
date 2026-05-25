alter table public.contracts
  add column if not exists opis_rachunku       text not null default '',
  add column if not exists opis_rachunku_media text not null default '';
