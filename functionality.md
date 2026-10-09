# BMT — Dokumentacja funkcjonalna

Aplikacja do zarządzania nieruchomościami na wynajem (single-tenant, jeden admin). Obsługuje nieruchomości, najemców, umowy, saldo najemców ("skarbonka"), import wyciągów bankowych, rozliczanie mediów oraz automatyczne przypomnienia e-mail.

> Stan opisu: październik 2026. Źródłem prawdy jest kod i migracje w `supabase/migrations`; reguły rozliczeń są dodatkowo w `AGENTS.md`.

---

## Spis treści

1. [Architektura i stack](#architektura-i-stack)
2. [Zasady rozliczeń (czynsze vs media)](#zasady-rozliczeń-czynsze-vs-media)
3. [Model danych](#model-danych)
4. [Uwierzytelnianie](#uwierzytelnianie)
5. [Nawigacja / strony](#nawigacja--strony)
6. [Dane podstawowe: nieruchomości, najemcy, umowy](#dane-podstawowe-nieruchomości-najemcy-umowy)
7. [Czynsze (generateRents)](#czynsze-generaterents)
8. [Media: grupy rozliczeniowe i rozliczanie](#media-grupy-rozliczeniowe-i-rozliczanie)
9. [Odczyty liczników przez najemcę](#odczyty-liczników-przez-najemcę)
10. [Import wyciągów bankowych i uzgadnianie](#import-wyciągów-bankowych-i-uzgadnianie)
11. [Model finansowy — "Skarbonka"](#model-finansowy--skarbonka)
12. [Kontrola płatności i wyciągi dla najemców](#kontrola-płatności-i-wyciągi-dla-najemców)
13. [E-maile i historia wiadomości](#e-maile-i-historia-wiadomości)
14. [Automatyzacje i crony](#automatyzacje-i-crony)
15. [Rozliczanie wstecz ("w przeszłości")](#rozliczanie-wstecz-w-przeszłości)
16. [Ustawienia](#ustawienia)
17. [Historia, audyt, podgląd bazy](#historia-audyt-podgląd-bazy)
18. [Panel testowy i wirtualny zegar](#panel-testowy-i-wirtualny-zegar)
19. [Integracje zewnętrzne](#integracje-zewnętrzne)
20. [Środowiska, wdrażanie, testy](#środowiska-wdrażanie-testy)
21. [Zmienne środowiskowe](#zmienne-środowiskowe)

---

## Architektura i stack

- **Framework**: Next.js 16 (App Router), TypeScript, server actions (`'use server'`) jako główna warstwa logiki
- **Baza danych / auth / storage**: Supabase (PostgreSQL, Supabase Auth, Supabase Storage); dostęp przez `@supabase/supabase-js` i `@supabase/ssr`, bez ORM-a
- **UI**: Tailwind CSS v4, shadcn/ui (`@base-ui/react`), ikony Lucide, TanStack Query
- **E-mail**: Gmail SMTP przez `nodemailer` (patrz [E-maile](#e-maile-i-historia-wiadomości))
- **Arkusze / PDF**: Google Sheets API v4 i Google Drive API v3 (media), `pdfkit` (wyciągi dla najemców)
- **Import**: PapaParse (CSV), `pdf-parse` (PDF — tylko układ Millennium)
- **Hosting**: Vercel (crony w `vercel.json`)
- **Typy bazy**: `types/supabase.ts` (generowane `npm run db:types`; bywa nieaktualne — część kolumn, np. `import_id`, kod obchodzi przez `as any`)

### Struktura katalogów

```
app/
  (dashboard)/            # chronione strony (layout z Sidebar)
    kontrola-platnosci/   # strona startowa (/ przekierowuje tutaj)
    umowy/ nieruchomosci/ najemcy/ (+ [id])
    media/ (+ [groupId])  # definicje grup rozliczeniowych
    rozlicz-media/ (+ [groupId])  # rozliczanie miesiąca
    import/ (+ history, reconcile, uploads)
    historia/ historia-obciazen/ historia-mediow/ historia-importow/ wiadomosci/
    rozlicz-w-przeszlosci/ media-w-przeszlosci/   # opcjonalne, patrz niżej
    automatyzacje/ ustawienia/ testowanie/ baza-danych/
  odczyty/[token]/        # PUBLICZNY formularz odczytów dla najemcy
  login/
  api/
    cron/{generate-rents,statement-reminder,meter-reading-reminder}/
    health/  attachments/  media-settlement-pdf/  media/save-readings/
    run-skill/ skills/ skill-files/ skill-prompts/   # skill runner (VPS)
lib/                      # logika biznesowa (balance, statement, rents, email, sheetsEngine, ...)
components/               # sidebar, ui/ (shadcn), itp.
supabase/migrations/      # jedyne źródło zmian schematu
skill-runner/             # osobny serwer na VPS uruchamiający skille
__tests__/{unit,integration}/  e2e/  tests-support/
```

---

## Zasady rozliczeń (czynsze vs media)

Obowiązujące reguły (kanonicznie w `AGENTS.md`):

1. **Czynsze** — system NIE generuje faktur/PDF ani nie wysyła e-maili o czynszu. `generateRents` tworzy wyłącznie rekord w tabeli `invoices` (`number: null`), który jest zobowiązaniem najemcy w saldzie. Formalne faktury są wystawiane w zewnętrznym systemie księgowym.
2. **Media ("Noty obciążeniowe")** — rozliczenie liczy się w Google Sheets: aplikacja kopiuje arkusz-szablon, wpisuje odczyty, odczytuje kwoty, eksportuje PDF-y i wysyła je e-mailem. Układ noty żyje w szablonie arkusza (tymczasowy — do uzupełnienia, gdy będą znane wymagania). W kodzie nie ma własnego generowania PDF dla mediów.

Rachunki za media też zapisują się jako `invoices` z `number: null`; numeracja `MM/YYYY/NNN` została wycofana (migracje `0029`, `0031`).

---

## Model danych

Schemat zmienia się wyłącznie migracjami (`supabase/migrations`, ~57 plików). Tabele (schemat `public`):

| Tabela | Rola |
|---|---|
| `properties` | Nieruchomości: `name`, `address1`, `address2`, `type` |
| `tenants` | Najemcy: `tenant_type` (PRIVATE/BUSINESS), `first_name`, `last_name`, `company_name`, `email`, `email2`, `phone`, `nip`, `address1/2`, `bank_accounts_as_text`, `property_id`, `payment_account` (1/2), `reading_token` |
| `contracts` | Umowy: `contract_type`, `rent_amount`, `start_date`, `end_date`, `is_active`, `has_media_invoice`, `opis_rachunku`, `opis_rachunku_media`, `tenant_id` (+ pozostałości `invoice_seq_number`, `media_invoice_seq_number`) |
| `invoices` | Obciążenia (zobowiązania): `type` (RENT/MEDIA/OTHER), `amount`, `month`, `year`, `number` (null), `source` (CRON/MANUAL/TEST_MANUAL/…), `tenant_id`, `contract_id`, `media_settlement_id` |
| `transactions` | Zatwierdzone transakcje: `type` (BANK/CASH/ADJUSTMENT), `status`, `amount`, `date`, `title`, `bank_account`, `category` (RENT/MEDIA), `tenant_id`, `raw_data`, `import_id` |
| `transaction_staging` | Zaimportowane wiersze czekające na zatwierdzenie: `suggested_tenant_id`, `is_duplicate`, `raw_data`, `import_id` |
| `transaction_amendments` | Historia edycji transakcji |
| `settlement_groups` | Grupy rozliczeniowe mediów: `spreadsheet_id`, `input_mapping_json`, `output_mapping_json`, `pdf_sheets_json`, `tenant_reading_keys`, szablony e-maila (`email_subject_template`, `email_body_template`) |
| `settlement_group_properties` | Powiązanie grupa ↔ nieruchomość (wiele-do-wielu) |
| `media_settlements` | Wykonane rozliczenia (grupa × miesiąc × rok): `spreadsheet_id` (kopii roboczej), `drive_pdf_ids` |
| `media_meter_readings` | Odczyty liczników: `group_id`, `month`, `year`, `key`, `value` (źródło "poprzednich odczytów") |
| `app_config` | Jeden wiersz (`id = 1`) z ustawieniami i szablonami e-maili |
| `email_logs` | Dziennik wysłanych e-maili (z załącznikami) |
| `reminder_dedup` | Atomowa deduplikacja przypomnień: unikalne `(action_name, dedup_key)` |
| `audit_log` | Dziennik operacji (`action_name`, `before_data`, `after_data`, `error_data`); wiersze `importBankStatement` służą też jako "batch" importu |
| `operation_log` | Starszy dziennik operacji |
| `skill_prompts` | Prompty dla skill runnera |
| `profiles` | Profile użytkowników Supabase Auth |

Funkcja SQL: `get_previous_meter_readings(group_id, month, year)`.

Usunięte (nie istnieją już): `monthly_tasks` (`0030`), `reminder_schedules` / `reminder_tenants` (`0003`) — dawny dashboard zadań i elastyczne przypomnienia.

### Statusy transakcji

`MATCHED`, `MANUAL` — realny wpływ (liczone do salda). Pozostałe nie są liczone: `UNMATCHED`, `SKIPPED`, `REJECTED_OWN_TRANSFER`, `REJECTED_DUPLICATE`, `REJECTED_OTHER`; `PENDING` jest tylko etykietą prezentacyjną dla wierszy w `transaction_staging`. Lista dochodowa: `INCOME_TRANSACTION_STATUSES` w `lib/transactionStatus.ts` (whitelist — nowy status jest domyślnie wykluczony z sum).

### Ochrona przed usuwaniem

Trigger `prevent_delete_*` blokuje `DELETE` z `transactions` i `invoices`, dopóki `app_config.allow_destructive_test_deletes` nie jest `true`. Flagę może ustawić tylko kod dostępny poza produkcją (panel testowy, testy integracyjne).

### Konfiguracja (`app_config`)

Ustawienia: `admin_email`, `payment_account_1_name` / `payment_account_2_name`, `ignored_source_accounts`, `backfill_rents_enabled`, `statement_cutoff_day` (nieużywane w kodzie aplikacji), `time_offset_ms` (wirtualny zegar), `allow_destructive_test_deletes`. Szablony e-maili: przypomnienie o zaległości (`late_reminder_*`), przypomnienie o odczytach (`meter_reading_reminder_*`, `meter_reading_closed_message`), przypomnienie o wgraniu wyciągu (`statement_upload_reminder_*`), a także starsze pola (`rent_*`, `reminder_*`, `rent_invoice_*`, `drive_invoices_folder_id`, `email_provider*`).

---

## Uwierzytelnianie

- **Supabase Auth**, e-mail + hasło; konto admina zakłada się ręcznie w Supabase (Authentication → Users).
- Middleware `proxy.ts` (Next 16) odświeża sesję przez `lib/supabase/middleware.ts`; `requireAuth()` w `lib/auth.ts` przekierowuje na `/login`.
- Strona logowania: `/login`; wylogowanie przez `logoutAction` w Sidebarze.
- Publiczne: `/login` oraz formularz odczytów `/odczyty/[token]` (autoryzacja tokenem najemcy).
- Server actions używają klienta service-role (`lib/supabase/service.ts`), więc sprawdzanie sesji dotyczy stron i layoutu.
- Endpointy cron: `Authorization: Bearer <CRON_SECRET>` albo nagłówek `x-vercel-cron: 1`. Uwaga: gdy `CRON_SECRET` nie jest ustawiony, porównanie z `Bearer undefined` przechodzi — zob. `testing-plan.md`.

---

## Nawigacja / strony

`/` przekierowuje na `/kontrola-platnosci`. Menu boczne (`components/sidebar.tsx`):

**Akcje**
- `/kontrola-platnosci` — Kontrola płatności
- `/rozlicz-media` — Rozlicz media
- `/import` — Import wyciągów (CSV/PDF); podstrony `/import/reconcile`, `/import/uploads`, `/import/history`

**Dane**
- `/umowy`, `/nieruchomosci`, `/najemcy` (+ `/najemcy/[id]`), `/media` (grupy rozliczeniowe, + `/media/[groupId]`)

**Historia**
- `/historia-obciazen`, `/historia` (operacje / audit log), `/import/history` (historia przelewów), `/historia-importow`, `/historia-mediow`, `/wiadomosci` (historia wiadomości)

**Dolne zakładki**
- `/automatyzacje`, `/ustawienia`, `/baza-danych`, `/testowanie` (tylko poza produkcją albo z `NEXT_PUBLIC_ALLOW_TEST_PANEL=true`)

**Niebezpieczne (opcjonalne)** — `/rozlicz-w-przeszlosci`, `/media-w-przeszlosci`; widoczne tylko gdy `app_config.backfill_rents_enabled = true`.

---

## Dane podstawowe: nieruchomości, najemcy, umowy

### Nieruchomości (`/nieruchomosci`)
CRUD w dialogu (`address1` i `type` wymagane). Usuwanie zablokowane, gdy nieruchomość ma najemców. Tabela z filtrem tekstowym i fasetowym po typie.

### Najemcy (`/najemcy`, `/najemcy/[id]`)
- CRUD; typ PRIVATE / BUSINESS (BUSINESS: `company_name`, NIP, adres), dwa adresy e-mail (`email`, `email2`), numery kont bankowych (`bank_accounts_as_text`, wiele linii), `payment_account` (konto 1/2, patrz Ustawienia), unikalny `reading_token` do formularza odczytów.
- Usuwanie zablokowane, gdy najemca ma umowy.
- Szczegóły najemcy: saldo, wyciąg, przyciski dodawania korekty (`addAdjustment`) i ręcznej transakcji bankowej (`addManualBankTransaction`), edycja transakcji (`updateTransaction`) z historią zmian w `transaction_amendments`.
- Filtr tekstowy i fasetowy po nieruchomości.

### Umowy (`/umowy`)
- CRUD: najemca, typ, kwota czynszu, daty od/do, `is_active`, `has_media_invoice` (czy najemca jest rozliczany z mediów), opisy rachunków.
- **Rewaluacja** (`revaluateContract`): podwyższa `rent_amount` o procent inflacji dla zaznaczonych umów.
- Statystyki (`getContractStats`): liczba aktywnych umów, naliczone czynsze w miesiącu.
- `contractCoversPeriod` (`lib/contracts.ts`): umowa z `end_date` wcześniejszym niż dany miesiąc nie jest naliczana; miesiąc zakończenia jest jeszcze objęty naliczaniem.
- Usuwanie bez blokad (zobowiązania i transakcje zostają).

---

## Czynsze (generateRents)

`lib/rents.ts`:
- `getRentPreview(month, year)` — aktywne umowy bez rachunku RENT za dany miesiąc (filtr `contractCoversPeriod`); dzieli na mających i niemających e-maila (informacyjnie).
- `generateRents(month, year, source)` — dla każdej umowy `upsert` w `invoices` (`type: 'RENT'`, `number: null`, `amount = rent_amount`, `contract_id`, `source`), z `ignoreDuplicates` (ponowne uruchomienie nie dubluje). **Nie generuje PDF i nie wysyła e-maili.** Wpis do `audit_log` (`generateRents`).
- Uruchamiane przez cron `GET /api/cron/generate-rents` (1. dnia miesiąca, 08:00). `source`: `CRON` (Vercel Cron), `MANUAL` (`CRON_SECRET`), `TEST_MANUAL` (poza produkcją lub z panelem testowym; tylko wtedy działają parametry `?month=&year=`).
- Podgląd nadchodzącego naliczenia: `/automatyzacje` (`getUpcomingRentCharges`).

---

## Media: grupy rozliczeniowe i rozliczanie

### Grupy rozliczeniowe (`/media`)
Grupa łączy nieruchomości z arkuszem Google (szablon). Pola: nazwa, nieruchomości, `spreadsheet_id`, `input_mapping_json` (pola formularza: `source` = `user` / `db` / `auto`, `range` = named range, `save_key`, `db_key`), `output_mapping_json` (named range → `tenant_id`, `type`, `email_pdfs`), `pdf_sheets_json` (zakładki eksportowane do PDF), `tenant_reading_keys` (jakie odczyty podaje który najemca), szablony e-maila grupy. CRUD z filtrem tekstowym.

### Rozlicz media (`/rozlicz-media`, `/rozlicz-media/[groupId]`)

> W kodzie istnieje też starsza kopia tego ekranu pod `/media/[groupId]` (z własnym `media/actions.ts`), do której nic nie linkuje; aktualny przepływ to `/rozlicz-media`.
`processSettlement(groupId, inputValues, month, year, previousReadingOverrides)`:
1. Tworzy w Drive strukturę `DEVELOPMENT|PREVIEW|PRODUCTION / rok / miesiąc / grupa` i kopiuje arkusz-szablon (kopia robocza).
2. Buduje wartości: dane z formularza, "poprzednie odczyty" z bazy (`source: db`, z możliwością nadpisania), pola automatyczne (adres nieruchomości).
3. Sprawdza obecność named ranges w kopii, zapisuje wartości (`writeInputValues`), odczytuje kwoty (`readOutputValues`).
4. Eksportuje PDF-y (osobny plik na zakładkę z `pdf_sheets_json`) i zapisuje je w Supabase Storage (`preview/` jako prefiks poza produkcją).
5. Upsertuje `media_settlements` oraz odczyty do `media_meter_readings` (poprzednie odczyty dla następnego miesiąca).
6. Dla każdego wpisu wyjściowego tworzy obciążenie `invoices` (`number: null`, `media_settlement_id`, `ignoreDuplicates`) i wysyła najemcy e-mail z PDF-ami (`email` + `email2`).
7. Wysyła administratorowi podsumowanie kwot (best-effort — błąd nie przerywa rozliczenia), loguje w `audit_log`.

Walidacje: ujemna kwota przerywa rozliczenie; najemca musi mieć aktywną umowę z `has_media_invoice`; brakujące named ranges → błąd; wartość błędu arkusza (`#...`) traktowana jako 0.
Znane ograniczenia (z `testing-plan.md`): przy błędzie walidacji wiersz `media_settlements` i PDF-y są już zapisane; ponowne rozliczenie tego samego miesiąca zachowuje pierwszą kwotę (`ignoreDuplicates`).

Pomocnicze: ręcznie wgrywane pliki (bucket `manual-uploads`, `components/uploaded-files.tsx`, akcje w `rozlicz-media/uploads-actions.ts`), historia w `/historia-mediow` i `/historia-obciazen`, pliki PDF serwowane przez `/api/media-settlement-pdf/[...path]`.

---

## Odczyty liczników przez najemcę

Publiczna strona `/odczyty/[token]` (token = `tenants.reading_token`):
- Dostępna dla najemców z aktywną umową z mediami, przypisanych do grupy, w której mają zdefiniowane klucze odczytów (`tenant_reading_keys`).
- **Okno podawania odczytów: od 25. do 5. dnia miesiąca.** Od 25. podaje się odczyt za bieżący miesiąc, od 1. do 5. — za miesiąc, który się skończył. Poza oknem (6.–24.) formularz jest zablokowany i pokazuje `meter_reading_closed_message`.
- Pokazuje poprzednie odczyty; blokuje ponowne wysłanie, gdy wszystkie klucze najemcy mają już odczyt; zapis do `media_meter_readings` (`saveReadings`).

---

## Import wyciągów bankowych i uzgadnianie

### Import (`/import`)
`importBankStatement(content, fileName, dayFrom, dayTo, docSlot)`:
- Obsługuje CSV (`lib/csvParser.ts`: PKO BP, mBank, Santander, ING, Millennium + parser generyczny; polskie kwoty `1 234,56`, daty `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`) oraz PDF (`lib/pdfParser.ts`, tylko układ Millennium).
- Opcjonalne przycięcie do zakresu dni miesiąca (`dayFrom`/`dayTo`) — pozwala wgrać dwa nakładające się wyciągi bez dubli; podpowiedź poprzedniego zakresu per "slot" dokumentu (0 = CSV, 1/2 = dwa wyciągi PDF).
- Wiersze, których parser nie umiał odczytać (nieparsowalna kwota), trafiają od razu do `transactions` jako `SKIPPED`; jeśli konto jest na liście `ignored_source_accounts` → `REJECTED_OWN_TRANSFER`.
- Pozostałe (także wychodzące, `amount <= 0` — w UI domyślnie oznaczone do odrzucenia) trafiają do `transaction_staging` z `suggested_tenant_id` (dopasowanie po numerze konta, `lib/matcher.ts`: normalizacja bez spacji/myślników/prefiksu `PL`, dopasowanie dokładne lub po sufiksie) oraz flagą `is_duplicate`.
- Wiersz `audit_log` (`importBankStatement`) jest rezerwowany na początku jako batch (`import_id`); po imporcie zawiera podsumowanie.
- Kopia pliku jest zapisywana lokalnie w `data/attachments` (zob. ryzyko na Vercelu w `testing-plan.md`).

### Uzgadnianie (`/import/reconcile`)
- `reconcileTransaction` / `reconcileMany` — przenosi wiersz z `transaction_staging` do `transactions` jako `MATCHED` (opcjonalnie z kategorią RENT/MEDIA), może zapamiętać numer konta w `bank_accounts_as_text` najemcy.
- `dismissTransaction` / `dismissAllTransactions` — odrzucenie (`REJECTED_OTHER`, `REJECTED_OWN_TRANSFER`, `REJECTED_DUPLICATE`).
- `updateTransactionCategory` — zmiana kategorii RENT/MEDIA.
- Historia: `/import/history` (przelewy), `/historia-importow` (importy z żywym statusem).

---

## Model finansowy — "Skarbonka"

```
Saldo = Σ(transakcje MATCHED + MANUAL) − Σ(invoices)
```

- Dodatnie saldo = nadpłata, ujemne = zaległość (`lib/balance.ts`, `calculateBalance`).
- Brak parowania 1:1 wpłata ↔ obciążenie.
- Wyciąg (`lib/statement.ts`, `getStatement`): chronologiczna lista obciążeń (kwota ujemna, opis "Obciążenie - Czynsz/Media") i wpłat (dodatnia) z bieżącym saldem. `isPaid` liczone modelem puli kredytu (płatność po dacie obciążenia go nie pokrywa) — nie jest nigdzie pokazywane w UI.

---

## Kontrola płatności i wyciągi dla najemców

`/kontrola-platnosci`:
- Lista najemców z saldem (najgorsze na górze), kontem płatniczym, datą ostatniego importu dla konta, filtry tekstowe/fasetowe.
- Statystyki globalne (`getGlobalPaymentStats`).
- `sendStatementToTenant(id)` i `sendBulkStatements()` — e-mail z PDF-em wyciągu (`lib/pdf.ts`, `pdfkit`) do najemców z saldem < 0 i adresem e-mail (do `email` + `email2`), szablon `late_reminder_*`.

---

## E-maile i historia wiadomości

`lib/email.ts`:
- Transport: `nodemailer` przez Gmail SMTP (`smtp.gmail.com:587`). Nadawca = `app_config.admin_email` (Ustawienia), hasło aplikacji Gmail = env `GMAIL_APP_PASSWORD`.
- Typy: media (`sendMediaEmail`), wyciąg/zaległość (`sendStatementEmail`), przypomnienie o wgraniu wyciągu (do admina), podsumowanie rozliczenia mediów (do admina), przypomnienie o odczytach, (`sendRentEmail` — historyczne, nieużywane przez `generateRents`).
- Temat dostaje prefiks `[DEVELOPMENT]` / `[PREVIEW]` poza produkcją. **Preview wysyła prawdziwe e-maile** — zob. `testing-plan.md`.
- Każda wysyłka zapisuje się w `email_logs` (odbiorcy, temat, treść, załączniki). Podgląd: `/wiadomosci` z filtrami po dacie i odbiorcy.

---

## Automatyzacje i crony

Zaplanowane w `vercel.json` (Vercel Cron, metoda GET):

| Endpoint | Harmonogram | Co robi |
|---|---|---|
| `/api/cron/generate-rents` | `0 8 1 * *` — 1. dnia miesiąca | Tworzy obciążenia RENT (bez e-maili) |
| `/api/cron/statement-reminder` | `0 8 * * *` — codziennie | 16. dnia miesiąca wysyła adminowi przypomnienie o wgraniu wyciągu (raz/miesiąc) |
| `/api/cron/meter-reading-reminder` | `0 8 * * *` — codziennie | W ostatnim dniu miesiąca wysyła najemcom link do formularza odczytów (raz/miesiąc) |

Wszystkie jobs (`statement-reminder`, `meter-reading-reminder`) są idempotentne dzięki `reminder_dedup` — zastrzeżenie klucza `YYYY-M`; przy błędzie wysyłki zastrzeżenie jest zwalniane.

Przypomnienie o zaległościach (`lib/late-reminders.ts`, od 15. dnia miesiąca, wyciąg do dłużników, dedup per najemca/miesiąc) **nie ma crona** w `vercel.json` — jest wywoływane tylko ręcznie z panelu testowego (`runLateRemindersTest`). Ręcznie można też wysłać wyciągi z Kontroli płatności.

`/automatyzacje` jest podglądem (odbiorcy przypomnień o odczytach, najbliższe czynsze, podglądy e-maili grup mediów, daty ostatnich uruchomień z `audit_log`) i miejscem edycji szablonów e-maili.

---

## Rozliczanie wstecz ("w przeszłości")

Funkcje włączane flagą `backfill_rents_enabled` (Ustawienia):
- `/rozlicz-w-przeszlosci` — wsteczne dopisanie czynszów za zakres miesięcy (`previewBackfillRents` → `executeBackfillRents`); umowa obowiązuje w miesiącu według dat (a nie `is_active`); umowa nieaktywna bez `end_date` jest pomijana; maks. 120 miesięcy na przebieg (`lib/rents-backfill.ts`). Migracja `20261005120000_backfill_rents.sql`.
- `/media-w-przeszlosci` — wsteczne dopisanie obciążeń za media z ręcznie podanych kwot (`saveMediaBackfill`); umowa dobierana przez `pickContractForMonth`.

---

## Ustawienia

`/ustawienia` (`app_config`): adres administratora (nadawca e-maili i odbiorca przypomnień), nazwy dwóch kont płatniczych, lista kont własnych ignorowanych przy imporcie (`ignored_source_accounts`), przełącznik "Rozlicz w przeszłości". Szablony e-maili edytuje się w `/automatyzacje`.

---

## Historia, audyt, podgląd bazy

- `/historia` — `audit_log` (kto/co/kiedy, dane przed/po, błędy). Operacje zapisują się przez `logAudit` (`lib/audit.ts`, nigdy nie rzuca).
- `/historia-obciazen` — wszystkie obciążenia; `/historia-mediow` — rozliczenia mediów; `/historia-importow`, `/import/history` — importy i przelewy; `/wiadomosci` — e-maile.
- `/baza-danych` — podgląd dowolnej tabeli z białej listy (`ALLOWED_TABLES`), stronicowany, tylko odczyt.

---

## Panel testowy i wirtualny zegar

`/testowanie` (tylko poza produkcją albo z `NEXT_PUBLIC_ALLOW_TEST_PANEL=true`):
- **Wirtualny zegar** (`lib/clock.ts`): `app_config.time_offset_ms` przesuwa "teraz" w crony i okno odczytów; na produkcji offset jest zawsze 0. Cała logika dat w automatyzacjach pyta o czas przez `getCurrentDate()`.
- Ręczne odpalenie przypomnień (zaległości, wyciąg), zerowanie sald (`zeroAllTenantBalances`), czyszczenie historii transakcji, generowanie testowego obciążenia za media.

---

## Integracje zewnętrzne

- **Google Sheets** (`lib/sheetsEngine.ts`, Service Account): zapis/odczyt named ranges, walidacja zakresów, eksport PDF (z opcjami zakresu i orientacji).
- **Google Drive** (`lib/driveEngine.ts`, OAuth2): foldery `ŚRODOWISKO/rok/miesiąc/grupa`, kopiowanie arkusza-szablonu, upload i usuwanie plików.
- **Supabase Storage**: PDF-y rozliczeń, załączniki e-maili (`/api/attachments/[filename]`), ręczne uploady (bucket `manual-uploads`), bucket faktur.
- **Gmail SMTP** — wysyłka e-maili.
- **Skill runner** (`skill-runner/`, `/api/run-skill`, `/api/skills`, `/api/skill-files`, `/api/skill-prompts`, `lib/skill-runner-client.ts`): osobny serwer na VPS uruchamiający skille Claude Code na żądanie; aplikacja wykrywa jego port, autoryzuje tokenem `SKILL_RUNNER_TOKEN`. Komponent `components/skill-runner.tsx` istnieje, ale nie jest obecnie podpięty do żadnej strony.
- `lib/numberWords.ts` — kwota słownie po polsku (pozostałość po fakturach PDF).

---

## Środowiska, wdrażanie, testy

Trzy środowiska (`lib/env.ts`, `getEnvTier()` z `VERCEL_ENV`): `DEVELOPMENT`, `PREVIEW`, `PRODUCTION`. Każde ma własny projekt Supabase.

**Droga na produkcję**: wyłącznie `scripts/push-preview.sh` — db push na bazę dev → commit/push brancha → testy jednostkowe (vitest) → e2e w GitHub Actions na świeżym deployu preview → PR `dev → master` (merge ręcznie). Bezpośredni push do `master` jest niedozwolony. Pre-push hook (`.husky/pre-push`) uruchamia gitleaks i testy jednostkowe.

**Migracje**: `npm run vercel-build` (`scripts/vercel-build.mjs`) puszcza `supabase db push` jako krok builda; rozjazd historii migracji blokuje deploy (zasady w `AGENTS.md`).

**Testy**:
- Jednostkowe (`npm run test:unit`, `__tests__/unit`): salda, wyciągi, czynsze i backfill, umowy, matcher, parsery CSV/PDF, przypomnienia, status transakcji, kwoty słownie.
- Integracyjne (`npm run test:integration`, `__tests__/integration`): server actions na bazie preview z danymi `E2E_TEST__` — import, płatności, rozliczanie mediów (Google zamockowane), wiadomości, crony; nodemailer zamockowany.
- E2E (Playwright, `npm run test:e2e`, `e2e/`): umowy, najemcy, nieruchomości, CRUD grup mediów; szczegóły w `e2e/README.md`. Plan dalszych testów: `testing-plan.md`.

---

## Zmienne środowiskowe

| Zmienna | Opis |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Projekt Supabase (publiczne) |
| `SUPABASE_SERVICE_ROLE_KEY` | Klucz serwera (tajny, omija RLS) |
| `SUPABASE_DB_URL` | Connection string do `supabase db push` (build Vercela, `push-preview.sh`) |
| `GMAIL_APP_PASSWORD` | Hasło aplikacji Gmail dla nadawcy z `app_config.admin_email` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service Account (Sheets, base64 lub raw JSON) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` | OAuth2 dla Google Drive |
| `CRON_SECRET` | Sekret autoryzacji endpointów cron (Bearer) |
| `NEXT_PUBLIC_APP_URL` | Publiczny URL aplikacji (linki w e-mailach z odczytami) |
| `NEXT_PUBLIC_ALLOW_TEST_PANEL` | `true` odblokowuje panel testowy i wirtualny zegar poza dev/preview |
| `SKILL_RUNNER_URL`, `SKILL_RUNNER_TOKEN` | Skill runner na VPS |
| `VERCEL_ENV` / `NEXT_PUBLIC_VERCEL_ENV` | Ustawiane przez Vercel (warstwa środowiska) |

Zmienne skryptów deploy/testów (`SUPABASE_URL_*`, `SUPABASE_KEY_*`, `VPS_*`, `.env.deploy.example`, `.env.e2e.example`) — zob. odpowiednie pliki `.example` oraz `e2e/README.md`.
