-- Szablon maila przypomnienia dla prywatnych najemców
alter table public.app_config
  add column if not exists reminder_subject text not null default 'Przypomnienie o płatności czynszu {miesiac}/{rok}',
  add column if not exists reminder_body    text not null default E'Szanowny/a {imie},\n\nPrzypominamy o płatności czynszu za {miesiac}/{rok} w kwocie {kwota} zł.\n\nPozdrawiamy,\nBMT';
