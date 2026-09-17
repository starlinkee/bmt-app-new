alter table skill_prompts
  add column settlement_group_id bigint references settlement_groups (id) on delete set null;
