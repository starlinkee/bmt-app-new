-- Dodaj nazwę firmy do najemcy (używana na rachunkach zamiast imienia i nazwiska)
alter table public.tenants add column if not exists company_name text;
