create table if not exists public.media_meter_readings (
  id         bigint generated always as identity primary key,
  group_id   bigint not null references public.settlement_groups (id) on delete cascade,
  month      int not null,
  year       int not null,
  key        text not null,
  value      numeric not null,
  created_at timestamptz not null default now(),
  unique (group_id, month, year, key)
);

alter table public.media_meter_readings enable row level security;
create policy "service_role full access" on public.media_meter_readings using (true);

-- Zwraca ostatni odczyt każdego klucza dla danej grupy sprzed podanego miesiąca/roku
create or replace function public.get_previous_meter_readings(
  p_group_id bigint,
  p_month    int,
  p_year     int
)
returns table(key text, value numeric)
language sql
stable
as $$
  select distinct on (key) key, value
  from public.media_meter_readings
  where group_id = p_group_id
    and (year < p_year or (year = p_year and month < p_month))
  order by key, year desc, month desc;
$$;
