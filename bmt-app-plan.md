# BMT App — Plan budowy

Aplikacja do zarządzania nieruchomościami na wynajem. Single-tenant, jedno hasło, jeden admin.

---

## Stack

| Warstwa       | Technologia                          |
|---------------|--------------------------------------|
| Framework     | Next.js 16 (App Router), TypeScript  |
| Styling       | Tailwind CSS v4 + shadcn/ui          |
| Ikony         | Lucide React                         |
| Baza danych   | Supabase (PostgreSQL)                |
| Auth          | Supabase Auth (email+password, 1 użytkownik) |
| Email         | Resend                               |
| Hosting       | Vercel (cron via `vercel.json`)      |
| Zewnętrzne    | Google Sheets API v4, Google Drive API v3 |
| CSV           | PapaParse                            |
| Toasty        | Sonner                               |

> Stripe — **nie używamy**.

---

## Struktura katalogów (docelowa)

```
app/
  (dashboard)/
    layout.tsx              # Sidebar + auth guard
    page.tsx                # Dashboard
    properties/
      page.tsx
    tenants/
      page.tsx
      [id]/
        page.tsx            # Szczegóły najemcy
    contracts/
      page.tsx
    finance/
      page.tsx
    media/
      page.tsx
      [groupId]/
        page.tsx
    reminders/
      page.tsx
    import/
      page.tsx
      reconcile/
        page.tsx
    settings/
      page.tsx
  api/
    auth/                   # Supabase Auth callback
    cron/
      reminders/
        route.ts
    health/
      route.ts
  login/
    page.tsx
  layout.tsx
  globals.css
components/
  sidebar.tsx
  invoice-status-badge.tsx
  ui/                       # shadcn/ui
lib/
  supabase/
    client.ts
    server.ts
    middleware.ts
  auth.ts                   # helper sprawdzający sesję server-side
  balance.ts
  csvParser.ts
  driveEngine.ts
  email.ts
  matcher.ts
  numberWords.ts
  sheetsEngine.ts
  statement.ts
  tasks.ts
  utils.ts
middleware.ts
types/
  supabase.ts               # generowane przez Supabase CLI
supabase/
  migrations/
vercel.json                 # cron config
```

---

## Model danych — tabele Supabase

### `properties`
| Kolumna    | Typ       |
|------------|-----------|
| id         | bigint PK |
| name       | text      |
| address1   | text      |
| address2   | text?     |
| type       | text      |
| created_at | timestamptz |
| updated_at | timestamptz |

### `tenants`
| Kolumna              | Typ       |
|----------------------|-----------|
| id                   | bigint PK |
| tenant_type          | text      | -- PRIVATE / BUSINESS
| first_name           | text      |
| last_name            | text      |
| email                | text?     |
| phone                | text?     |
| bank_accounts_as_text| text      |
| nip                  | text?     |
| address1             | text?     |
| address2             | text?     |
| property_id          | bigint FK |

### `contracts`
| Kolumna            | Typ       |
|--------------------|-----------|
| id                 | bigint PK |
| contract_type      | text      | -- BUSINESS / PRIVATE
| rent_amount        | numeric   |
| invoice_seq_number | int       |
| start_date         | date      |
| end_date           | date?     |
| is_active          | boolean   |
| tenant_id          | bigint FK |

### `invoices`
| Kolumna          | Typ       |
|------------------|-----------|
| id               | bigint PK |
| type             | text      | -- RENT / MEDIA / OTHER
| number           | text      |
| amount           | numeric   |
| month            | int       |
| year             | int       |
| tenant_id        | bigint FK |
| UNIQUE (tenant_id, type, month, year) |

### `transactions`
| Kolumna      | Typ       |
|--------------|-----------|
| id           | bigint PK |
| type         | text      | -- BANK / CASH / ADJUSTMENT
| status       | text      | -- MATCHED / UNMATCHED / MANUAL / DISMISSED
| amount       | numeric   |
| date         | date      |
| title        | text      |
| bank_account | text?     |
| description  | text?     |
| tenant_id    | bigint FK? |

### `settlement_groups`
| Kolumna              | Typ       |
|----------------------|-----------|
| id                   | bigint PK |
| name                 | text      |
| spreadsheet_id       | text      |
| input_mapping_json   | jsonb     |
| output_mapping_json  | jsonb     |

### `settlement_group_properties`
| Kolumna             | Typ       |
|---------------------|-----------|
| settlement_group_id | bigint FK |
| property_id         | bigint FK |
| PRIMARY KEY (settlement_group_id, property_id) |

### `app_config`
| Kolumna                         | Typ  |
|---------------------------------|------|
| id                              | int  | -- zawsze 1
| rent_invoice_spreadsheet_id     | text |
| rent_invoice_input_mapping_json | jsonb |
| rent_invoice_pdf_gid            | text |
| drive_invoices_folder_id        | text |

### `reminder_schedules`
| Kolumna      | Typ         |
|--------------|-------------|
| id           | bigint PK   |
| name         | text        |
| day_of_month | int         |
| hour         | int         |
| subject      | text        |
| body         | text        |
| is_active    | boolean     |
| last_sent_at | timestamptz? |

### `reminder_tenants`
| Kolumna     | Typ       |
|-------------|-----------|
| reminder_id | bigint FK |
| tenant_id   | bigint FK |
| PRIMARY KEY (reminder_id, tenant_id) |

### `monthly_tasks`
| Kolumna      | Typ         |
|--------------|-------------|
| id           | bigint PK   |
| type         | text        | -- RENT / MEDIA
| month        | int         |
| year         | int         |
| status       | text        | -- TODO / DONE
| completed_at | timestamptz? |
| UNIQUE (type, month, year) |

---

## Zmienne środowiskowe

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth (jedno hasło dla całej aplikacji)
APP_PASSWORD=
APP_ADMIN_EMAIL=admin@example.com   # e-mail do konta Supabase Auth

# Resend
RESEND_API_KEY=
RESEND_FROM=BMT <noreply@example.com>
RESEND_REPLY_TO=

# Google
GOOGLE_SERVICE_ACCOUNT_JSON=        # raw JSON lub base64 (Sheets + PDF export)
GOOGLE_OAUTH_CLIENT_ID=             # Drive upload
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REFRESH_TOKEN=

# Cron
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Fazy implementacji

---

### Faza 1 — Fundament projektu

**Cel**: działające środowisko, auth, layout.

#### 1.1 Zależności
- Zainstalować: `papaparse @types/papaparse sonner`
- Zainstalować shadcn komponenty: `button badge card input label select textarea dialog table dropdown-menu switch toast`
- Sprawdzić czy `lucide-react` jest dostępne (jest w package.json)

#### 1.2 Supabase — migracje
- Stworzyć migrację `0001_init.sql` z wszystkimi tabelami wymienionymi w modelu danych powyżej
- Dodać RLS policies (dostęp tylko dla zalogowanego użytkownika — service_role dla Server Actions)
- Uruchomić migrację lokalnie

#### 1.3 Typy
- Wygenerować `types/supabase.ts` przez `npm run db:types`
- Stworzyć `types/app.ts` z lokalnymi typami (enums: `TenantType`, `ContractType`, `InvoiceType`, `TransactionType`, `TransactionStatus`, `MonthlyTaskType`, `MonthlyTaskStatus`)

#### 1.4 Auth — Supabase Auth (jeden użytkownik)
- Strategia: Supabase Auth z email+password. Jedno konto admina tworzone przez migrację lub seed.
- Stworzyć `lib/auth.ts` — helper `getSession()` dla Server Components i `requireAuth()` rzucający redirect do `/login`
- Zaktualizować `middleware.ts` — chronić wszystkie ścieżki poza `/login`
- Stworzyć `app/login/page.tsx` — formularz (email + password), Server Action do `signInWithPassword`, przekierowanie na `/` po sukcesie

#### 1.5 Layout dashboardu
- Stworzyć `components/sidebar.tsx` — menu z linkami do wszystkich sekcji + przycisk wylogowania (wywołuje `supabase.auth.signOut`)
- Stworzyć `app/(dashboard)/layout.tsx` — sprawdza sesję, renderuje `<Sidebar>` + `{children}`

---

### Faza 2 — Model danych: Server Actions

**Cel**: warstwa danych dla każdej encji. Wszystko jako Server Actions (`"use server"`).

#### 2.1 Properties (`app/(dashboard)/properties/actions.ts`)
- `getProperties()` — lista z count najemców
- `createProperty(data)` — walidacja `address1` + `type` wymagane
- `updateProperty(id, data)`
- `deleteProperty(id)` — błąd jeśli ma najemców

#### 2.2 Tenants (`app/(dashboard)/tenants/actions.ts`)
- `getTenants()` — lista z nieruchomością i count aktywnych umów
- `getTenant(id)` — pełne dane z nieruchomością i umowami
- `createTenant(data)` — dla BUSINESS: wymagane NIP + address
- `updateTenant(id, data)`
- `deleteTenant(id)` — błąd jeśli ma umowy

#### 2.3 Contracts (`app/(dashboard)/contracts/actions.ts`)
- `getContracts()` — lista z najemcą i nieruchomością
- `createContract(data)`
- `updateContract(id, data)`
- `deleteContract(id)`

#### 2.4 Invoices — tworzone przez Finance i Media, nie przez osobną stronę CRUD.

#### 2.5 Transactions (`app/(dashboard)/import/actions.ts`)
- `importCsvTransactions(csvContent)` — parse + match + batch insert
- `getUnmatchedTransactions()` — lista UNMATCHED + type=BANK
- `reconcileTransaction(txId, tenantId, saveAccount)`
- `dismissTransaction(txId)`

#### 2.6 SettlementGroups (`app/(dashboard)/media/actions.ts`)
- `getSettlementGroups()` — lista z propertiami
- `getSettlementGroup(id)`
- `createSettlementGroup(data)`
- `updateSettlementGroup(id, data)`
- `deleteSettlementGroup(id)`

#### 2.7 Reminders (`app/(dashboard)/reminders/actions.ts`)
- `getReminders()` — z listą najemców
- `createReminder(data)`
- `updateReminder(id, data)`
- `deleteReminder(id)`
- `sendReminderNow(id)`
- `toggleReminder(id, isActive)`

#### 2.8 Settings (`app/(dashboard)/settings/actions.ts`)
- `getAppConfig()`
- `upsertAppConfig(data)`

#### 2.9 Monthly Tasks (`lib/tasks.ts`)
- `ensureMonthlyTasks(month, year)` — upsert RENT + MEDIA dla miesiąca
- `markMonthlyTaskDone(type, month, year)`
- `getMonthlyTasks(month, year)`

---

### Faza 3 — Logika biznesowa (lib/)

**Cel**: czyste funkcje, niezależne od UI.

#### 3.1 `lib/balance.ts`
```
calculateBalance(tenantId): Promise<number>
  = SUM(transactions.amount) - SUM(invoices.amount)
```

#### 3.2 `lib/statement.ts`
- `getStatement(tenantId): Promise<StatementEntry[]>`
- Łączy invoices + transactions w chronologiczny wyciąg
- Oblicza `runningBalance` dla każdego wpisu
- Symuluje status opłacenia rachunków (creditPool od najstarszego)

#### 3.3 `lib/numberWords.ts`
- `amountToWordsPLN(amount): string`
- Np. `2500.00` → `"dwa tysiące pięćset złotych 00/100"`

#### 3.4 `lib/csvParser.ts`
- Detekcja banku na podstawie nagłówków CSV
- Obsługiwane banki: PKO BP, mBank, Santander, ING, Millenium + fallback
- Normalizacja kwot (format polski: `1 234,56` → `1234.56`)
- Normalizacja dat (`DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`)
- Zwraca `ParsedTransaction[]`

#### 3.5 `lib/matcher.ts`
- `matchTransaction(bankAccount, tenants): Tenant | null`
- Normalizacja konta (usuwa spacje, myślniki, prefix "PL")
- Dopasowanie dokładne lub suffix

#### 3.6 `lib/sheetsEngine.ts`
- Auth: Service Account JSON (raw lub base64)
- `writeInputValues(spreadsheetId, inputMapping, values)`
- `triggerRecalc(spreadsheetId)`
- `readOutputValues(spreadsheetId, outputMapping)`
- `writeNamedRanges(spreadsheetId, values)`
- `exportSheetAsPdf(spreadsheetId, gid?): Promise<Buffer>`

#### 3.7 `lib/driveEngine.ts`
- Auth: OAuth2 z refresh token
- `getOrCreateFolder(name, parentId?)`
- `ensureYearMonthFolder(year, month, rootFolderId)`
- `uploadPdfToDrive(filename, buffer, folderId)`

#### 3.8 `lib/email.ts`
- `sendRentEmail(to, tenantName, invoiceNumber, amount, month, year, pdfBuffer?)`
- `sendMediaEmail(to, tenantName, invoiceNumber, amount, month, year)`
- `sendReminderEmail(to, tenantName, subject, body)`
- Wszystkie używają Resend, formatują kwoty po polsku

#### 3.9 `lib/utils.ts`
- `cn()` helper (clsx + tailwind-merge) — już istnieje
- `buildInvoiceNumber(month, year, seqNumber, type): string` — format `MM/YYYY/NNN` z offsetami (RENT+0, MEDIA+9, OTHER+19)
- `formatAmount(amount): string` — `1 234,56 zł`
- `formatDate(date): string` — `DD.MM.YYYY`

---

### Faza 4 — Strony UI

**Cel**: każda strona z pełnym CRUD / przepływem.

#### 4.1 Dashboard (`app/(dashboard)/page.tsx`)
- `ensureMonthlyTasks` przy wejściu (Server Component)
- Statystyki bieżącego miesiąca: aktywne umowy, wystawione czynsze, suma czynszów
- Lista zadań z filtrem "Do zrobienia" / "Zrobione"
  - MonthlyTask: RENT (link do `/finance`) + MEDIA (link do `/media`)
  - ReminderSchedule: aktywne, status = lastSentAt >= początku miesiąca
- Karty ze statystykami (shadcn `Card`)

#### 4.2 Nieruchomości (`app/(dashboard)/properties/page.tsx`)
- Tabela: nazwa, adres, typ, liczba najemców
- Przycisk "Dodaj" → Dialog z formularzem (address1, type wymagane, name, address2)
- Kliknięcie wiersza lub "Edytuj" → Dialog prefill
- "Usuń" → blokada jeśli ma najemców (toast z komunikatem błędu)
- URL param `?open=id` otwiera modal edycji

#### 4.3 Najemcy — lista (`app/(dashboard)/tenants/page.tsx`)
- Tabela: imię+nazwisko, nieruchomość, typ, e-mail, telefon, aktywne umowy
- Dialog tworzenia/edycji:
  - Pola bazowe: imię, nazwisko, nieruchomość (Select), typ (PRIVATE/BUSINESS)
  - Warunkowe dla BUSINESS: NIP, adres1, adres2
  - Dla obu: e-mail, telefon, numery kont (Textarea)
- "Usuń" → blokada jeśli ma umowy

#### 4.4 Najemca — szczegóły (`app/(dashboard)/tenants/[id]/page.tsx`)
- Nagłówek: imię, nazwisko, nieruchomość, typ
- Karty: saldo, kwota aktywnej umowy, liczba operacji
- Wyciąg (`getStatement`) — tabela z kolumnami: data, opis, kwota, saldo, status (badge Opłacone/Zaległe)
- Dialog "Dodaj korektę" — kwota, opis, data → tworzy `Transaction` (type=ADJUSTMENT, status=MANUAL)
- Komponent `InvoiceStatusBadge` (zielony/czerwony)

#### 4.5 Umowy (`app/(dashboard)/contracts/page.tsx`)
- Tabela: najemca+nieruchomość, typ, kwota, nr porządkowy, daty, aktywna
- Dialog: wybór najemcy (Select), typ, kwota, invoiceSeqNumber (ukryte dla PRIVATE), daty, isActive
- Edycja i usuwanie

#### 4.6 Finance (`app/(dashboard)/finance/page.tsx`)
- Picker miesiąca i roku (domyślnie bieżący)
- Przycisk "Wystaw czynsze" → `getRentPreview(month, year)`:
  - Pobiera aktywne umowy BUSINESS bez rachunku RENT w tym miesiącu
  - Dzieli na "z e-mailem" i "bez e-maila"
- Dialog potwierdzenia z listą obu grup
- Po potwierdzeniu → `generateRents(month, year)`:
  - Tworzy Invoice dla każdego
  - Generuje PDF (jeśli skonfigurowane Sheets) + upload Drive + wysyłka e-mail
  - Progress bar (`pdfCount * 4000 + 3000` ms, asymptotyczne 95% → 100%)
  - Oznacza MonthlyTask RENT jako DONE
- Tabela podglądu: istniejące rachunki RENT dla wybranego miesiąca

#### 4.7 Media — lista grup (`app/(dashboard)/media/page.tsx`)
- Tabela grup: nazwa, nieruchomości, ID arkusza
- Dialog tworzenia/edycji:
  - Nazwa, ID arkusza Google
  - Checkboxy nieruchomości (wiele-do-wielu)
  - Textarea `inputMappingJSON` + `outputMappingJSON`
- Usuwanie z kaskadą

#### 4.8 Media — rozliczenie grupy (`app/(dashboard)/media/[groupId]/page.tsx`)
- Formularz z polami z `inputMappingJSON` (etykiety → pola input)
- Picker miesiąca i roku
- Przycisk "Przelicz i wystaw" → `processSettlement(groupId, inputValues, month, year)`:
  - Zapisuje odczyty do arkusza
  - Wymusza przeliczenie (triggerRecalc)
  - Odczytuje wyniki dla najemców
  - Tworzy Invoice MEDIA dla kwot > 0 (bez duplikatów)
  - Wysyła e-maile do najemców z adresem
  - Oznacza MonthlyTask MEDIA jako DONE
- Lista wystawionych rachunków MEDIA dla grupy w wybranym miesiącu

#### 4.9 Import CSV (`app/(dashboard)/import/page.tsx`)
- Input file (CSV)
- Po wyborze pliku: parsowanie na kliencie (PapaParse)
- `importCsvTransactions(csvContent)` — Server Action
- Statystyki po imporcie: bank, łączna liczba, dopasowane, niedopasowane, pominięte
- Link do `/import/reconcile`

#### 4.10 Reconcile (`app/(dashboard)/import/reconcile/page.tsx`)
- Lista transakcji UNMATCHED (type=BANK)
- Dla każdej: data, tytuł, konto nadawcy, kwota
- Dropdown wyboru najemcy + przycisk "Przypisz"
- Przed przypisaniem (jeśli transakcja ma `bankAccount`): Dialog "Zapamiętać numer konta?" (checkbox)
- Przycisk "Odrzuć" → status = DISMISSED

#### 4.11 Przypomnienia (`app/(dashboard)/reminders/page.tsx`)
- Lista przypomnień: nazwa, dzień+godzina, najemcy, status, switch aktywny/nieaktywny
- Dialog tworzenia/edycji: nazwa, dzień miesiąca, godzina, temat, treść (textarea), multi-select najemców
- Przycisk "Wyślij teraz" → `sendReminderNow(id)` → toast z liczbą wysłanych
- Usuwanie z kaskadą

#### 4.12 Ustawienia (`app/(dashboard)/settings/page.tsx`)
- Formularz edycji `app_config`:
  - ID arkusza Google (rent invoice)
  - JSON mapowania danych do arkusza (textarea z walidacją JSON)
  - GID zakładki (opcjonalne)
  - ID folderu Drive
- Domyślne mapowanie jako placeholder w textarea
- Zapis przez `upsertAppConfig`

---

### Faza 5 — API Routes

#### 5.1 Cron — przypomnienia (`app/api/cron/reminders/route.ts`)
- `POST` — autoryzacja: `x-vercel-cron: 1` lub `Authorization: Bearer <CRON_SECRET>`
- Pobiera aktywne przypomnienia
- Filtruje po `dayOfMonth` i `hour` (bieżący czas)
- Pomija jeśli `lastSentAt` >= początku bieżącego miesiąca
- Wysyła e-maile, aktualizuje `lastSentAt`
- Zwraca `{ sent: n, skipped: m }`

#### 5.2 Health (`app/api/health/route.ts`)
- `GET` → `{ status: "ok", timestamp }`

#### 5.3 `vercel.json` — cron config
```json
{
  "crons": [{
    "path": "/api/cron/reminders",
    "schedule": "0 * * * *"
  }]
}
```

---

### Faza 6 — Komponenty współdzielone

#### 6.1 `components/sidebar.tsx`
- Linki do wszystkich sekcji z ikonami Lucide
- Aktywny link wyróżniony
- Przycisk wylogowania (Supabase `signOut`)
- Responsywny (mobile: collapsible lub drawer)

#### 6.2 `components/invoice-status-badge.tsx`
- Props: `isPaid: boolean`
- Zielony badge "Opłacone" / czerwony "Zaległe"
- Używa shadcn `Badge`

#### 6.3 `components/month-year-picker.tsx`
- Select miesiąca + Select roku
- Używany w Finance i Media

---

### Faza 7 — Konfiguracja deploymentu

#### 7.1 `.env.example`
- Wszystkie zmienne z opisami (patrz sekcja Zmienne środowiskowe)

#### 7.2 Vercel
- `vercel.json` z cron config
- Wszystkie env vars ustawione w Vercel Dashboard

#### 7.3 Supabase
- Produkcyjna baza w Supabase Cloud
- Migracje przez `supabase db push`
- RLS włączone, server actions używają `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS)

---

## Kolejność implementacji (checklisty)

### Faza 1 — Fundament
- [ ] 1.1 Doinstalować zależności (`papaparse`, `sonner`)
- [ ] 1.2 Dodać shadcn komponenty (`input`, `label`, `select`, `textarea`, `dialog`, `table`, `dropdown-menu`, `switch`, `sonner`)
- [ ] 1.3 Migracja SQL — wszystkie tabele
- [ ] 1.4 Generowanie typów (`npm run db:types`)
- [ ] 1.5 `types/app.ts` — lokalne enumy i typy
- [ ] 1.6 `lib/auth.ts` — `requireAuth()` dla Server Components
- [ ] 1.7 `middleware.ts` — ochrona tras
- [ ] 1.8 `app/login/page.tsx` — formularz logowania
- [ ] 1.9 `components/sidebar.tsx`
- [ ] 1.10 `app/(dashboard)/layout.tsx`

### Faza 2 — Logika (lib/)
- [ ] 2.1 `lib/utils.ts` — `buildInvoiceNumber`, `formatAmount`, `formatDate`
- [ ] 2.2 `lib/numberWords.ts`
- [ ] 2.3 `lib/balance.ts`
- [ ] 2.4 `lib/statement.ts`
- [ ] 2.5 `lib/csvParser.ts`
- [ ] 2.6 `lib/matcher.ts`
- [ ] 2.7 `lib/tasks.ts`
- [ ] 2.8 `lib/email.ts`
- [ ] 2.9 `lib/sheetsEngine.ts`
- [ ] 2.10 `lib/driveEngine.ts`

### Faza 3 — Server Actions
- [ ] 3.1 Properties actions
- [ ] 3.2 Tenants actions
- [ ] 3.3 Contracts actions
- [ ] 3.4 Import/transactions actions
- [ ] 3.5 Media/settlement actions
- [ ] 3.6 Finance actions (`getRentPreview`, `generateRents`)
- [ ] 3.7 Reminders actions
- [ ] 3.8 Settings actions
- [ ] 3.9 Monthly tasks actions

### Faza 4 — Strony UI
- [ ] 4.1 Dashboard
- [ ] 4.2 Nieruchomości
- [ ] 4.3 Najemcy — lista
- [ ] 4.4 Najemca — szczegóły + wyciąg
- [ ] 4.5 Umowy
- [ ] 4.6 Finance (wystawienie czynszu + progress bar)
- [ ] 4.7 Media — lista grup
- [ ] 4.8 Media — rozliczenie grupy
- [ ] 4.9 Import CSV
- [ ] 4.10 Reconcile
- [ ] 4.11 Przypomnienia
- [ ] 4.12 Ustawienia

### Faza 5 — API + Deploy
- [ ] 5.1 `app/api/cron/reminders/route.ts`
- [ ] 5.2 `app/api/health/route.ts`
- [ ] 5.3 `vercel.json` z cron
- [ ] 5.4 `.env.example` kompletne
- [ ] 5.5 Produkcyjna migracja Supabase

---

## Kluczowe zachowania do pilnowania

1. **Model salda "Skarbonka"** — brak parowania 1:1, status opłacenia symulowany od najstarszego rachunku.
2. **Numeracja rachunków** — `invoiceSeqNumber` per umowa + offset per typ (RENT+0, MEDIA+9, OTHER+19).
3. **Unikalność rachunku** — `(tenant_id, type, month, year)` unikalne — nie duplikować przy ponownym uruchomieniu.
4. **Tylko BUSINESS generuje rachunki i e-maile** — PRIVATE ignorowane w `generateRents`.
5. **Rate limiting przy PDF** — 4s delay między kolejnymi eksportami Google Sheets.
6. **Cron idempotentny** — jedno przypomnienie wysyłane raz na miesiąc (sprawdzaj `lastSentAt`).
7. **Reconcile z zapamiętaniem konta** — opcja dopisania konta do `bank_accounts_as_text`.
8. **Walidacja usuwania** — tenant nie do usunięcia z umowami; nieruchomość z najemcami.
9. **Google Drive ≠ Google Sheets auth** — Sheets używa Service Account, Drive używa OAuth2.
10. **RLS + service role** — Server Actions muszą używać klienta z `SUPABASE_SERVICE_ROLE_KEY` żeby ominąć RLS.
