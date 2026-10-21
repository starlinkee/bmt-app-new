---
status: todo
---
# Krok 01: Crony i przypomnienia per konto (slice 4a)

## Cel
Crony i joby automatyzacji działają w pętli po kontach, każdy zapis service rolą ma jawne `owner_id` (nic nie
polega na DEFAULT `current_owner_id()`), dedup przypomnień jest per konto, a nowe konto nie dostaje tekstów z „BMT”.
Właściciel dostaje e-maile o dokładnie tej samej treści co dziś. Zamyka dziurę: drugie konto widzi dziś w zakładce
Automatyzacje czynsze i najemców właściciela.

Pełny packet (mapa zmian, kroki, proof contract): `/home/shiva/.openrig/workspace/projects/bmt-app/missions/multi-account/slices/06-s4a-crons-per-owner/SPEC.md`.
Pomoc (niezweryfikowana, nie stosować na ślepo): `…/06-s4a-crons-per-owner/ref/`.

## Zakres
- Migracja + rollback: `reminder_dedup` unikalny `(owner_id, action_name, dedup_key)` (nazwę starego constraintu
  ustal z `pg_constraint`); szablony właściciela, które są NULL w `app_config` i NULL/'' w
  `settlement_groups.email_body_template`, wypełnione dokładnym obecnym tekstem fallbacku z kodu; asercje w migracji.
- `listOwnerIds()` w `lib/app-config.ts`; `getLegacyOwnerId()` zostaje wyłącznie dla nadawcy e-maili (do slice 7).
- `ownerId` jako pierwszy parametr w `lib/rents.ts`, `lib/statement-reminder.ts`, `lib/meter-reading-reminder.ts`,
  `lib/late-reminders.ts`, `lib/email.ts` (`email_logs.owner_id`); `lib/audit.ts` — `ownerId` wymagane, poprawione
  wszystkie wywołania. Każde zapytanie service rolą `.eq('owner_id', …)`, każdy insert/upsert z `owner_id`.
- Crony `generate-rents`, `statement-reminder`, `meter-reading-reminder`: pętla po kontach, try/catch per konto,
  wynik per konto w odpowiedzi (bez danych osobowych).
- `automatyzacje/actions.ts` i `testowanie/actions.ts`: joby i podgląd tylko dla zalogowanego użytkownika.
- Jedna wspólna stała z neutralnym tekstem (moduł bez `'use server'`) w fallbackach `lib/email.ts` i placeholderach
  `automatyzacje`, `media`, `rozlicz-media`.
- Strażnik (reguła AST albo test runtime z mockiem klienta service), który wykrywa insert/upsert service rolą bez `owner_id`.
- Unit testy każdego cronu na 2 kontach w mocku: brak przecieków, dedup per konto, błąd konta A nie przerywa B;
  aktualizacja `crons.test.ts`.
- Push na `dev`, deploy preview z `Migracje OK.`, e2e przez `workflow_dispatch`. Na preview ręcznie wolno
  odpalić tylko `generate-rents` (raport liczb per konto, bez nazw).

## Poza zakresem
- Usunięcie fallbacku legacy z `current_owner_id()` (krok 02), storage i ścieżki plików (krok 03), Gmail per konto (krok 05).
- Branding aplikacji („BMT Nieruchomości” w `layout.tsx`, logowaniu, sidebarze) i domyślne nazwy kont bankowych — decyzje właściciela.
- Ręczne uruchamianie `statement-reminder`/`meter-reading-reminder` na preview; cokolwiek na `master`/produkcji.

## Kryteria akceptacji
- `npm run typecheck`, `npm run lint`, `npm run test` = 0; testy cronów na 2 kontach zielone.
- Strażnik działa: celowo usunięte `owner_id` w jednym insercie powoduje czerwony test.
- Tabela „zapis service rolą → skąd owner_id” (plik:linia) dla wszystkich insertów/upsertów service rolą w `app/**`, `lib/**`.
- Lista zmienionych tekstów (stary → nowy) i dowód, że szablony właściciela na preview mają dawne treści.
- Log builda preview zawiera `Migracje OK.`; e2e run zielony dla SHA tego builda.
- `grep` po „BMT” w `automatyzacje`, `media`, `rozlicz-media` i fallbackach `lib/email.ts` nic nie zwraca.

## Zablokowane (2026-10-21)
BLOCKED: preview dla 1ffb11c nie zbudował się - supabase db push odrzucony przez bazę preview (tenant/user postgres.emjiqrfpvdiyodzezzlm not found, connection string/projekt Supabase do poprawy przez właściciela); migracja 20261021090000 niezweryfikowana na bazie, brak Migracje OK., e2e i generate-rents nie wykonane. Kod + testy lokalne (260) zielone.
