alter table public.settlement_groups
  add column if not exists email_subject_template text,
  add column if not exists email_body_template    text;
