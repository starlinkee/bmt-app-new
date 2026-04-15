-- BMT App — tabele główne

-- properties
create table if not exists public.properties (
  id         bigint generated always as identity primary key,
  name       text not null,
  address1   text not null,
  address2   text,
  type       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.properties enable row level security;
create policy "service_role full access" on public.properties using (true);

-- tenants
create table if not exists public.tenants (
  id                    bigint generated always as identity primary key,
  tenant_type           text not null default 'PRIVATE',
  first_name            text not null,
  last_name             text not null,
  email                 text,
  phone                 text,
  bank_accounts_as_text text not null default '',
  nip                   text,
  address1              text,
  address2              text,
  property_id           bigint not null references public.properties (id) on delete restrict
);

alter table public.tenants enable row level security;
create policy "service_role full access" on public.tenants using (true);

-- contracts
create table if not exists public.contracts (
  id                 bigint generated always as identity primary key,
  contract_type      text not null default 'PRIVATE',
  rent_amount        numeric(10,2) not null,
  invoice_seq_number int not null default 1,
  start_date         date not null,
  end_date           date,
  is_active          boolean not null default true,
  tenant_id          bigint not null references public.tenants (id) on delete restrict
);

alter table public.contracts enable row level security;
create policy "service_role full access" on public.contracts using (true);

-- invoices
create table if not exists public.invoices (
  id        bigint generated always as identity primary key,
  type      text not null,
  number    text not null,
  amount    numeric(10,2) not null,
  month     int not null,
  year      int not null,
  tenant_id bigint not null references public.tenants (id) on delete restrict,
  unique (tenant_id, type, month, year)
);

alter table public.invoices enable row level security;
create policy "service_role full access" on public.invoices using (true);

-- transactions
create table if not exists public.transactions (
  id           bigint generated always as identity primary key,
  type         text not null default 'BANK',
  status       text not null default 'UNMATCHED',
  amount       numeric(10,2) not null,
  date         date not null,
  title        text not null default '',
  bank_account text,
  description  text,
  tenant_id    bigint references public.tenants (id) on delete set null
);

alter table public.transactions enable row level security;
create policy "service_role full access" on public.transactions using (true);

-- settlement_groups
create table if not exists public.settlement_groups (
  id                   bigint generated always as identity primary key,
  name                 text not null,
  spreadsheet_id       text not null default '',
  input_mapping_json   jsonb not null default '{}',
  output_mapping_json  jsonb not null default '{}'
);

alter table public.settlement_groups enable row level security;
create policy "service_role full access" on public.settlement_groups using (true);

-- settlement_group_properties
create table if not exists public.settlement_group_properties (
  settlement_group_id bigint not null references public.settlement_groups (id) on delete cascade,
  property_id         bigint not null references public.properties (id) on delete cascade,
  primary key (settlement_group_id, property_id)
);

alter table public.settlement_group_properties enable row level security;
create policy "service_role full access" on public.settlement_group_properties using (true);

-- app_config
create table if not exists public.app_config (
  id                              int primary key default 1,
  rent_invoice_spreadsheet_id     text not null default '',
  rent_invoice_input_mapping_json jsonb not null default '{}',
  rent_invoice_pdf_gid            text not null default '',
  drive_invoices_folder_id        text not null default '',
  constraint single_row check (id = 1)
);

alter table public.app_config enable row level security;
create policy "service_role full access" on public.app_config using (true);

-- Seed domyślnego wiersza app_config
insert into public.app_config (id) values (1) on conflict (id) do nothing;

-- reminder_schedules
create table if not exists public.reminder_schedules (
  id           bigint generated always as identity primary key,
  name         text not null,
  day_of_month int not null,
  hour         int not null,
  subject      text not null default '',
  body         text not null default '',
  is_active    boolean not null default true,
  last_sent_at timestamptz
);

alter table public.reminder_schedules enable row level security;
create policy "service_role full access" on public.reminder_schedules using (true);

-- reminder_tenants
create table if not exists public.reminder_tenants (
  reminder_id bigint not null references public.reminder_schedules (id) on delete cascade,
  tenant_id   bigint not null references public.tenants (id) on delete cascade,
  primary key (reminder_id, tenant_id)
);

alter table public.reminder_tenants enable row level security;
create policy "service_role full access" on public.reminder_tenants using (true);

-- monthly_tasks
create table if not exists public.monthly_tasks (
  id           bigint generated always as identity primary key,
  type         text not null,
  month        int not null,
  year         int not null,
  status       text not null default 'TODO',
  completed_at timestamptz,
  unique (type, month, year)
);

alter table public.monthly_tasks enable row level security;
create policy "service_role full access" on public.monthly_tasks using (true);
