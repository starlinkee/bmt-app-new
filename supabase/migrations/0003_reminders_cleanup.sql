-- Usunięcie systemu elastycznych przypomnień (zastąpione Vercel cronem dla prywatnych najemców)

drop table if exists public.reminder_tenants;
drop table if exists public.reminder_schedules;

-- Kolumna do idempotentności crona (nie wysyłaj dwa razy w tym samym miesiącu)
alter table public.contracts
  add column if not exists reminder_last_sent_at timestamptz;
