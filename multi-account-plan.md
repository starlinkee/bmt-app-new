# Multi-konto (multi-tenant) z RLS — plan i stan

Cel: wielu użytkowników, każdy na własnym koncie z kompletnie oddzielnymi danymi. Nowe konto przy pierwszym
logowaniu widzi puste listy (najemcy, nieruchomości, umowy, transakcje…) i domyślne, neutralne ustawienia.
Jeden użytkownik = jedno konto (`owner_id = auth.users.id`), bez organizacji/członkostw.

**Warunek absolutny:** istniejące dane właściciela zostają bez utraty (backfill sprawdzalny licznościami przed/po).

## Stan (aktualizuj przy każdym slice)

| Slice | Zakres | Stan | Commit |
|---|---|---|---|
| 0 | Dziura anon: polityki `TO service_role`, RLS na audit_log/email_logs/reminder_dedup, 401 bez sesji w trasach API | ✅ dev | `7014c19` |
| 0b | `requireUser` w każdej server action + strażnik; `getUser()`/`getClaims` zamiast `getSession()`; token najemcy w `/odczyty/[token]` | ✅ dev | `6f6b153`, `bb8b900`, `797dc8b`, `f1ce654` |
| 1 | `owner_id` + backfill właściciela + RLS per konto | ✅ dev | `a8e2332` |
| 2a–2e | Kod dashboardu i tras API na kliencie z sesją (RLS), publiczne odczyty zawężone do `owner_id` | ✅ dev | `d32a7d9` … `da6be5e` |
| 3 | `app_config` per konto (PK `owner_id`), `system_settings` globalne, neutralny wiersz nowego konta, `skill_prompts` per konto | ✅ dev, review PASS | `28aa74e` |
| **4a** | Crony i przypomnienia per konto, dedup per konto, jawny `owner_id` w każdym zapisie service rolą, neutralne fallbacki (bez „BMT”) | 📝 **następny** — packet budowy gotowy (planner, 12.10), build nie zaczęty | — |
| 4b | Usunięcie fallbacku legacy z `current_owner_id()` (insert bez owner_id pada głośno) | ⏳ | — |
| 5 | Storage per konto (buckety `invoices`, `manual-uploads`: prefiks `<owner_id>/`) | ⏳ | — |
| 6 | Testy izolacji (2 konta testowe, macierz per tabela) + e2e z logowaniem | ⏳ | — |
| 7 | Gmail/Google per konto (OAuth lub hasło aplikacji per konto, szyfrowane sekrety) — osobny plan | ⏳ | — |

**Produkcja (`master`): nic z tej misji jeszcze nie poszło** — `master` stoi na `74f9d47` (09.10).
Promocja `dev → master` tylko za osobną zgodą właściciela (migracje lecą na build produkcji).

## Decyzje właściciela

1. Konto właściciela = `bmt.nieruchomosci@gmail.com` — dostaje wszystkie obecne dane (backfill jawnie po e-mailu;
   migracja przerywa się, gdy tego użytkownika brak). Drugie konto już istnieje w auth.users i ma zostać puste.
2. Izolacja przez prawdziwy RLS, nie ręczne filtry. Service role tylko tam, gdzie nie ma użytkownika (crony),
   z jawną pętlą po kontach i `owner_id` w każdym zapytaniu.
3. Wszystko per konto: ustawienia, szablony wiadomości, adres administratora, przełączniki importów, arkusze Google.
4. Szablony nowego konta: neutralne (bez danych BMT).
5. Konta zakładane ręcznie w panelu Supabase Auth, bez UI rejestracji.
6. Do slice 7 wszystkie konta wysyłają e-maile ze wspólnego Gmaila właściciela (poświadczenia z env).
7. **Drugiego konta nie używamy na produkcji, dopóki nie są gotowe slice'y 1–5.** Na preview można.
8. Rotacja klucza anon: odroczona (decyzja właściciela), nic nie blokuje.

## Środowiska (bazy Supabase)

- PRODUCTION = `aimxvcnyzraoacrbdsbz` (deploy z `master`)
- PREVIEW = `emjiqrfpvdiyodzezzlm` (deploy z `dev`; tu idą migracje przy pushu na `dev`)
- DEVELOPMENT = `oljqcfgjomnvjkiztdby` (lokalne `.env.local`; nie jest zamiennikiem preview)

## Kluczowa decyzja techniczna: przejściowy właściciel domyślny

Kolumna `owner_id` ma `default public.current_owner_id()` = `coalesce(auth.uid(), <legacy owner>)` (tabela
`legacy_owner`). Dzięki temu slice'y szły pojedynczo bez psucia insertów ze starego kodu service rolą.
Slice 4a dopisuje jawne `owner_id` wszędzie; 4b usuwa fallback.

## Slice 4a — zakres (szczegóły)

- Crony (`generate-rents`, `statement-reminder`, `meter-reading-reminder`) i joby z panelu testowego/automatyzacji
  w pętli po kontach (`app_config.owner_id`); błąd jednego konta nie przerywa pozostałych (wynik per konto, bez danych osobowych).
- `lib/rents.ts`, `lib/statement-reminder.ts`, `lib/meter-reading-reminder.ts`, `lib/late-reminders.ts`: `ownerId` jako
  pierwszy parametr, każde zapytanie `.eq('owner_id', ownerId)`, każdy insert z `owner_id`.
- `lib/email.ts`: `email_logs.owner_id`; nadawca zostaje Gmail właściciela (`getLegacyOwnerId()` tylko do tego, do slice 7).
- `lib/audit.ts`: `ownerId` wymagany.
- `automatyzacje/actions.ts`, `testowanie/actions.ts`: joby uruchamiane tylko dla zalogowanego użytkownika.
- Migracja: `reminder_dedup` unikalny `(owner_id, action_name, dedup_key)`; szablony właściciela, które są NULL,
  wypełnione dokładnym obecnym tekstem fallbacku (właściciel dostaje e-maile bez zmian treści).
- Neutralne fallbacki w `lib/email.ts` i placeholderach stron (wspólna stała).
- Strażnik: insert/upsert service rolą bez `owner_id` jest wykrywany (AST albo test runtime).
- Testy unit cronów z 2 kontami w mocku (brak przecieków, dedup per konto, izolacja błędów).
- Na preview cronów nie uruchamiać ręcznie (wysyłają e-maile).

Poza zakresem 4a: 4b, storage (5), Gmail per konto (7), produkcja.

Znane luki, które 4a zamyka (stan na `28aa74e`):
- Zakładka Automatyzacje (`getUpcomingRentCharges` → `getRentPreview`, `getEligibleMeterReminderTenants`) liczy
  podgląd service rolą bez filtra `owner_id` — drugie konto widziałoby tam czynsze/najemców właściciela.
- `logAudit` bez `ownerId` w `rozlicz-media/uploads-actions.ts` i w libach cronów; `email_logs` bez `owner_id`
  (oba dostają dziś właściciela legacy z DEFAULT).
- Teksty z „BMT” poza e-mailami: `automatyzacje/page.tsx`, `automatyzacje/actions.ts`, `media/page.tsx`,
  `rozlicz-media/page.tsx` (wartość startowa szablonu nowej grupy). Szablony `settlement_groups.email_body_template`
  właściciela z NULL/'' też trzeba wypełnić dawnym tekstem w migracji (nie tylko kolumny `app_config`).
- Branding aplikacji („BMT Nieruchomości” w `layout.tsx`, `login`, `sidebar`) — poza 4a, decyzja właściciela.

## Ryzyka

- Migracje lecą na buildzie Vercela: błąd migracji = zablokowany deploy → każda migracja najpierw na preview.
- Funkcje `security definer` (`handle_new_user`, `get_previous_meter_readings`, `prevent_delete_function`) omijają RLS — przegląd przy zmianach.
- Import zapisuje pliki do `process.cwd()/data/attachments` (na Vercelu ulotny dysk) — osobny temat, poza misją.
