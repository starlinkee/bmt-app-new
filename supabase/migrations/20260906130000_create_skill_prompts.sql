create table if not exists skill_prompts (
  id text primary key,
  label text not null,
  description text,
  timeout_ms integer not null default 300000,
  prompt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table skill_prompts enable row level security;

create policy "Authenticated users can manage skill_prompts"
on skill_prompts for all
to authenticated
using (true)
with check (true);
