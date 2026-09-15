-- Atomowa ochrona przed podwójną wysyłką przypomnień (statement/meter/late
-- reminder). Poprzedni mechanizm sprawdzał audit_log (SELECT), wysyłał maila,
-- a dopiero potem zapisywał wpis (INSERT) - to dawało okno na race condition,
-- gdy endpoint/cron zostanie trafiony dwa razy blisko siebie: oba wywołania
-- zdążały zobaczyć "nie wysłano" zanim któreś zapisało log.
--
-- Zamiast tego najpierw "zastrzegamy" okres (miesiąc, ew. + tenant) unikalnym
-- INSERT-em do tej tabeli. Konflikt unique constraint = ktoś już to zastrzegł
-- (albo już wysłał), więc druga wysyłka się nie odbywa. Jeśli faktyczna
-- wysyłka maila się nie powiedzie, wpis jest kasowany, żeby kolejna próba
-- mogła spróbować ponownie.
CREATE TABLE reminder_dedup (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_name text NOT NULL,
  dedup_key   text NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (action_name, dedup_key)
);
