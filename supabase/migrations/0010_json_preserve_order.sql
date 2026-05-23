-- Zmiana z jsonb na json żeby zachować kolejność kluczy w mapowaniach
alter table public.settlement_groups
  alter column input_mapping_json type json using input_mapping_json::text::json;

alter table public.settlement_groups
  alter column output_mapping_json type json using output_mapping_json::text::json;

alter table public.settlement_groups
  alter column pdf_sheets_json type json using pdf_sheets_json::text::json;
