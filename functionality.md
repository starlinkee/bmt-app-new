# BMT — Dokumentacja funkcjonalna

Aplikacja do zarządzania nieruchomościami na wynajem. Obsługuje nieruchomości, najemców, umowy, rachunki, transakcje bankowe, rozliczenia mediów i automatyczne przypomnienia e-mail.

---

## Spis treści

1. [Architektura i stack](#architektura-i-stack)
2. [Model danych](#model-danych)
3. [Uwierzytelnianie](#uwierzytelnianie)
4. [Nawigacja / strony](#nawigacja--strony)
5. [Strona główna — Dashboard](#strona-główna--dashboard)
6. [Nieruchomości](#nieruchomości)
7. [Najemcy](#najemcy)
8. [Umowy](#umowy)
9. [Wystawienie czynszu (Finance)](#wystawienie-czynszu-finance)
10. [Media — Grupy rozliczeniowe](#media--grupy-rozliczeniowe)
11. [Import CSV (Transakcje bankowe)](#import-csv-transakcje-bankowe)
12. [Uzgadnianie transakcji (Reconcile)](#uzgadnianie-transakcji-reconcile)
13. [Przypomnienia e-mail](#przypomnienia-e-mail)
14. [Ustawienia aplikacji](#ustawienia-aplikacji)
15. [Model finansowy — "Skarbonka"](#model-finansowy--skarbonka)
16. [Wyciąg najemcy (Statement)](#wyciąg-najemcy-statement)
17. [Numeracja rachunków](#numeracja-rachunków)
18. [Integracje zewnętrzne](#integracje-zewnętrzne)
19. [Zadania miesięczne (MonthlyTask)](#zadania-miesięczne-monthlytask)
20. [Cron / automatyzacja](#cron--automatyzacja)
21. [Zmienne środowiskowe](#zmienne-środowiskowe)

---

## Architektura i stack

- **Framework**: Next.js (App Router), TypeScript
- **Baza danych**: PostgreSQL (Supabase) + Prisma ORM (wcześniej SQLite)
- **UI**: Tailwind CSS + shadcn/ui (Radix UI), ikony Lucide React
- **Auth**: NextAuth.js — Credentials Provider, JWT 30 dni
- **Email**: Resend (API)
- **Arkusze**: Google Sheets API v4 (Service Account JSON)
- **Drive**: Google Drive API v3 (OAuth2)
- **Deploy**: Vercel (cron via `vercel.json`)
- **Inne**: PapaParse (CSV), Sonner (toasty)

### Struktura katalogów

```
src/
  app/
    (dashboard)/          # Wszystkie chronione strony (layout z Sidebar + auth)
      page.tsx            # Strona główna
      properties/         # Nieruchomości
      tenants/            # Najemcy (lista + /[id] — szczegóły)
      contracts/          # Umowy
      finance/            # Wystawienie czynszu
      media/              # Media (lista grup + /[groupId] — rozliczenie)
      reminders/          # Przypomnienia
      import/             # Import CSV (+ /reconcile)
      settings/           # Ustawienia
    api/
      auth/[...nextauth]/ # NextAuth handler
      cron/reminders/     # Endpoint cron dla przypomnień
    login/                # Strona logowania
  lib/
    auth.ts               # Konfiguracja NextAuth
    balance.ts            # Obliczanie salda najemcy
    csvParser.ts          # Parser CSV banków
    driveEngine.ts        # Upload PDF na Google Drive
    email.ts              # Wysyłka e-maili (Resend)
    matcher.ts            # Dopasowanie transakcji do najemców
    numberWords.ts        # Kwota słownie po polsku
    prisma.ts             # Singleton klienta Prisma
    sheetsEngine.ts       # Operacje na Google Sheets
    statement.ts          # Wyciąg finansowy najemcy
    tasks.ts              # Zarządzanie zadaniami miesięcznymi
    utils.ts              # cn() helper
  components/
    sidebar.tsx           # Boczne menu
    invoice-status-badge.tsx  # Badge "Opłacone/Zaległe"
    ui/                   # Komponenty shadcn/ui
  generated/prisma/       # Wygenerowany klient Prisma
```

---

## Model danych

### Property (Nieruchomość)

| Pole      | Typ      | Opis                              |
|-----------|----------|-----------------------------------|
| id        | Int PK   | Auto increment                    |
| name      | String   | Nazwa własna (domyślnie "")       |
| address1  | String   | Główna linia adresu (wymagana)   |
| address2  | String?  | Dodatkowa linia adresu           |
| type      | String   | Typ lokalu (np. "mieszkanie")    |
| createdAt | DateTime |                                   |
| updatedAt | DateTime |                                   |

**Relacje**: ma wielu `Tenant[]`, należy do wielu `SettlementGroup` przez `SettlementGroupProperty[]`.

---

### Tenant (Najemca)

| Pole               | Typ    | Opis                                              |
|--------------------|--------|---------------------------------------------------|
| id                 | Int PK |                                                   |
| tenantType         | String | "PRIVATE" lub "BUSINESS" (domyślnie "PRIVATE")   |
| firstName          | String | Imię                                              |
| lastName           | String | Nazwisko                                          |
| email              | String? | E-mail (opcjonalny, używany do wysyłki)           |
| phone              | String? | Telefon                                           |
| bankAccountsAsText | String | Numery kont bankowych (wieloliniowy tekst)        |
| nip                | String? | NIP — tylko dla BUSINESS                         |
| address1           | String? | Adres dla faktury — tylko dla BUSINESS           |
| address2           | String? | Adres cd. — tylko dla BUSINESS                   |
| propertyId         | Int FK | Nieruchomość, do której przypisany               |

**Relacje**: należy do `Property`, ma wiele `Contract[]`, `Invoice[]`, `Transaction[]`, `ReminderTenant[]`.

**Ważne**: `bankAccountsAsText` to prosty tekst z numerami kont rozdzielonymi newline/przecinek/średnik. Używany do automatycznego dopasowania transakcji bankowych.

Dla najemców BUSINESS adres z faktury (`address1`/`address2`/`nip`) używany jest zamiast adresu nieruchomości przy generowaniu PDF rachunku.

---

### Contract (Umowa)

| Pole             | Typ      | Opis                                              |
|------------------|----------|---------------------------------------------------|
| id               | Int PK   |                                                   |
| contractType     | String   | "BUSINESS" lub inny (domyślnie "BUSINESS")       |
| rentAmount       | Float    | Kwota czynszu miesięcznego                       |
| invoiceSeqNumber | Int      | Numer porządkowy (do generowania nr rachunku)    |
| startDate        | DateTime | Data rozpoczęcia umowy                           |
| endDate          | DateTime? | Data zakończenia (null = bezterminowa)           |
| isActive         | Boolean  | Czy umowa jest aktywna                           |
| tenantId         | Int FK   |                                                   |

**Ważne**: Tylko umowy z `contractType = "BUSINESS"` i `isActive = true` generują rachunki i e-maile przy wystawianiu czynszu. Umowy PRIVATE są ignorowane przez `generateRents`.

`invoiceSeqNumber` jest ustawiany ręcznie. Służy do wyliczenia numeru rachunku (patrz sekcja Numeracja rachunków).

---

### Invoice (Rachunek)

| Pole           | Typ         | Opis                                          |
|----------------|-------------|-----------------------------------------------|
| id             | Int PK      |                                               |
| type           | InvoiceType | RENT / MEDIA / OTHER                         |
| number         | String      | Numer rachunku w formacie MM/YYYY/NNN        |
| amount         | Float       | Kwota                                         |
| month          | Int         | Miesiąc (1–12)                               |
| year           | Int         | Rok                                           |
| sourceFilePath | String?     | Ścieżka pliku źródłowego (nieużywana aktywnie)|
| tenantId       | Int FK      |                                               |

**Ograniczenie unikalne**: `(tenantId, type, month, year)` — jeden rachunek danego typu na miesiąc na najemcę.

**Typy**:
- `RENT` — rachunek za czynsz
- `MEDIA` — rachunek za media (prąd, woda, ogrzewanie)
- `OTHER` — inne opłaty

---

### Transaction (Transakcja)

| Pole        | Typ               | Opis                                              |
|-------------|-------------------|---------------------------------------------------|
| id          | Int PK            |                                                   |
| type        | TransactionType   | BANK / CASH / ADJUSTMENT                         |
| status      | TransactionStatus | MATCHED / UNMATCHED / MANUAL / DISMISSED         |
| amount      | Float             | Kwota (dodatnia = wpływ)                         |
| date        | DateTime          | Data operacji                                     |
| title       | String            | Tytuł/opis transakcji                            |
| bankAccount | String?           | Numer konta nadawcy/odbiorcy                     |
| description | String?           | Dodatkowy opis (dla korekt)                      |
| tenantId    | Int? FK           | Przypisany najemca (null = nieprzypisana)        |

**Typy transakcji**:
- `BANK` — import z wyciągu bankowego CSV
- `CASH` — wpłata gotówkowa (nieużywana aktywnie w UI)
- `ADJUSTMENT` — korekta ręczna (tworzona na stronie najemcy)

**Statusy**:
- `UNMATCHED` — zaimportowana, niezidentyfikowany najemca
- `MATCHED` — automatycznie lub ręcznie dopasowana do najemcy
- `MANUAL` — ręcznie dodana (np. korekta)
- `DISMISSED` — odrzucona, ignorowana

---

### SettlementGroup (Grupa rozliczeniowa — Media)

| Pole              | Typ    | Opis                                           |
|-------------------|--------|------------------------------------------------|
| id                | Int PK |                                                |
| name              | String | Nazwa (np. "Woda + Ścieki")                   |
| spreadsheetId     | String | ID arkusza Google Sheets                      |
| inputMappingJSON  | String | JSON z mapowaniem wejściowym (etykiety → komórki) |
| outputMappingJSON | String | JSON z mapowaniem wyjściowym (tenantId → komórki) |

**Relacje**: ma wiele `SettlementGroupProperty[]` (wiele-do-wielu z Property).

**inputMappingJSON** — tablica obiektów `{ label: string, range: string }`:
```json
[{"label": "lokal1_woda_zimna_odczyt", "range": "Arkusz1!A1"}]
```
Etykiety (label) są wyświetlane jako pola formularza na stronie rozliczenia. Użytkownik wpisuje wartości, które są zapisywane do arkusza.

**outputMappingJSON** — tablica obiektów `{ tenantId: number, range: string }`:
```json
[{"tenantId": 1, "range": "Arkusz1!B1"}]
```
Po przeliczeniu arkusza, wartości z tych komórek stają się kwotami rachunków MEDIA dla najemców.

---

### AppConfig (Konfiguracja aplikacji)

Pojedynczy rekord (id=1), tworzony automatycznie przy pierwszym dostępie.

| Pole                       | Typ    | Opis                                             |
|----------------------------|--------|--------------------------------------------------|
| rentInvoiceSpreadsheetId   | String | ID arkusza Google — szablon rachunku czynszu    |
| rentInvoiceInputMappingJSON| String | JSON mapowanie danych do arkusza               |
| rentInvoicePdfGid          | String | GID zakładki do eksportu PDF (opcjonalnie)      |
| driveInvoicesFolderId      | String | ID folderu Drive do zapisywania PDF              |

---

### ReminderSchedule (Harmonogram przypomnień)

| Pole        | Typ      | Opis                                     |
|-------------|----------|------------------------------------------|
| id          | Int PK   |                                          |
| name        | String   | Nazwa przypomnienia                      |
| dayOfMonth  | Int      | Dzień miesiąca (1–31)                   |
| hour        | Int      | Godzina (0–23)                          |
| subject     | String   | Temat wiadomości e-mail                  |
| body        | String   | Treść wiadomości                         |
| isActive    | Boolean  | Czy aktywne                              |
| lastSentAt  | DateTime? | Kiedy ostatnio wysłano                  |

**Relacje**: ma wiele `ReminderTenant[]`.

---

### ReminderTenant (Najemcy do przypomnienia)

Tabela łącząca `ReminderSchedule` ↔ `Tenant`. Klucz złożony `(reminderId, tenantId)`.

---

### MonthlyTask (Zadanie miesięczne)

| Pole        | Typ              | Opis                          |
|-------------|------------------|-------------------------------|
| id          | Int PK           |                               |
| type        | MonthlyTaskType  | RENT / MEDIA                 |
| month       | Int              | Miesiąc                      |
| year        | Int              | Rok                          |
| status      | MonthlyTaskStatus| TODO / DONE                  |
| completedAt | DateTime?        | Kiedy oznaczono jako zrobione |

**Ograniczenie unikalne**: `(type, month, year)`.

---

## Uwierzytelnianie

- **Mechanizm**: NextAuth.js, Credentials Provider
- **Dane**: tylko hasło (jedno hasło dla całej aplikacji)
- **Hasło**: przechowywane w zmiennej środowiskowej `APP_PASSWORD`
- **Sesja**: JWT, ważna 30 dni
- **Użytkownik sesji**: zawsze `{ id: "1", name: "Admin" }` (jeden użytkownik systemowy)
- **Strona logowania**: `/login`
- **Przekierowanie**: nieautoryzowani są kierowani na `/login`
- **Wylogowanie**: przycisk w Sidebar wywołuje `signOut({ callbackUrl: "/login" })`

---

## Nawigacja / strony

Wszystkie strony aplikacji są chronione. Layout `(dashboard)/layout.tsx` opakowuje je Sidebarem.

Strony w menu bocznym:
- `/` — Strona główna (zadania miesięczne + statystyki)
- `/properties` — Nieruchomości
- `/tenants` — Najemcy (lista)
- `/tenants/[id]` — Szczegóły najemcy (wyciąg, saldo, korekty)
- `/contracts` — Umowy
- `/finance` — Wystawienie czynszu
- `/media` — Media (lista grup rozliczeniowych)
- `/media/[groupId]` — Strona rozliczenia grupy mediów
- `/reminders` — Przypomnienia
- `/import` — Import CSV
- `/import/reconcile` — Uzgadnianie transakcji
- `/settings` — Ustawienia

---

## Strona główna — Dashboard

**Ścieżka**: `/`

**Funkcje**:
1. Przy wejściu wywołuje `initAndGetPageData` → tworzy (upsert) dwa zadania miesięczne dla bieżącego miesiąca: RENT i MEDIA.
2. Wyświetla statystyki bieżącego miesiąca:
   - Liczba aktywnych umów
   - Liczba wystawionych czynszów w bieżącym miesiącu
   - Suma wystawionych czynszów
3. Lista zadań z filtrem "Do zrobienia" / "Zrobione":
   - **Zadania miesięczne** (`MonthlyTask`): RENT i MEDIA — z linkami do odpowiednich stron
   - **Przypomnienia** (`ReminderSchedule`): aktywne, ze statusem opartym na `lastSentAt` (wysłane w bieżącym miesiącu = DONE)

**Logika statusu przypomnień**: przypomnienie jest "zrobione", jeśli `lastSentAt >= początek bieżącego miesiąca`.

---

## Nieruchomości

**Ścieżka**: `/properties`

**CRUD**:
- **Tworzenie**: formularz dialogowy — `address1` (wymagane), `type` (wymagane), `name`, `address2` (opcjonalne)
- **Edycja**: ten sam formularz, prefill z danymi
- **Usuwanie**: zablokowane jeśli nieruchomość ma przypisanych najemców (`tenantCount > 0`)

**Wyświetlane dane**:
- Tabela: nazwa, adres, typ, liczba najemców (z `_count.tenants`)
- Kliknięcie "Otwórz" (parametr URL `?open=id`) otwiera modal edycji (mechanizm przez URL param, zaimplementowany w page)

**Powiązania**: nieruchomość → wielu najemców → wiele umów/rachunków/transakcji.

---

## Najemcy

**Ścieżka**: `/tenants`

**Lista**: tabela z najemcami, posortowana od najnowszych. Kolumny: imię+nazwisko, nieruchomość, typ (PRIVATE/BUSINESS), e-mail, telefon, liczba aktywnych umów.

**CRUD**:
- **Tworzenie**: dialog — imię, nazwisko, nieruchomość (Select), typ (PRIVATE/BUSINESS)
  - Dla BUSINESS: dodatkowe pola NIP, adres1, adres2
  - Dla obu: e-mail, telefon, numery kont (textarea, wieloliniowe)
- **Edycja**: ten sam formularz, prefill
- **Usuwanie**: zablokowane jeśli najemca ma jakiekolwiek umowy (`contractCount > 0`)

**Strona szczegółów najemcy** `/tenants/[id]`:
- Wyświetla: imię, nazwisko, nieruchomość, typ
- Karty podsumowania: saldo, kwota aktywnej umowy, liczba operacji
- Wyciąg (tabela) — patrz sekcja [Wyciąg najemcy](#wyciąg-najemcy-statement)
- Przycisk "Dodaj korektę" — dialog z kwotą, opisem i datą

---

## Umowy

**Ścieżka**: `/contracts`

**Lista**: tabela ze wszystkimi umowami, posortowana od najnowszych. Kolumny: najemca+nieruchomość, typ, kwota czynszu, nr porządkowy, data od/do, status aktywności.

**CRUD**:
- **Tworzenie**: dialog — wybór najemcy (Select), typ umowy, kwota czynszu, `invoiceSeqNumber` (tylko dla BUSINESS), data start, data end (opcjonalna), checkbox isActive
- **Edycja**: ten sam formularz, prefill
- **Usuwanie**: bez blokad (rachunki i transakcje pozostają)

**Ważne**: `invoiceSeqNumber` jest ustawiany ręcznie przez użytkownika. Decyduje o numerze w generowanych rachunkach. Dla umów PRIVATE = 0 i pole jest ukryte.

---

## Wystawienie czynszu (Finance)

**Ścieżka**: `/finance`

### Przepływ generowania czynszów

1. Użytkownik wybiera miesiąc i rok (domyślnie: bieżący).
2. Kliknięcie "Wystaw czynsze" → wywołuje `getRentPreview`:
   - Pobiera aktywne umowy `contractType = "BUSINESS"`
   - Sprawdza, którzy najemcy nie mają jeszcze rachunku RENT w wybranym miesiącu/roku
   - Zwraca listę: kto dostanie rachunek i e-mail, kto tylko rachunek (bez e-maila)
3. Wyświetla dialog potwierdzenia z podziałem:
   - "Otrzymają e-mail" (najemcy z adresem e-mail)
   - "Bez e-maila" (najemcy bez adresu)
4. Po potwierdzeniu → `generateRents(month, year)`:
   - Tworzy rachunki `Invoice` (type=RENT) dla wszystkich nowych
   - Numer rachunku: `buildInvoiceNumber(month, year, invoiceSeqNumber, "RENT")`
   - Dla każdego najemcy z e-mailem:
     - Opcjonalnie generuje PDF z Google Sheets (jeśli `rentInvoiceSpreadsheetId` skonfigurowane)
     - Opcjonalnie zapisuje PDF na Google Drive
     - Wysyła e-mail przez Resend z PDF jako załącznik
   - Oznacza zadanie miesięczne RENT jako DONE

### Generowanie PDF rachunku

Wymaga skonfigurowanego `rentInvoiceSpreadsheetId` w Ustawieniach oraz `GOOGLE_SERVICE_ACCOUNT_JSON` w env.

Przepływ:
1. Buduje `context` z danych rachunku (numer, najemca, adres, NIP, miesiąc, rok, kwota, kwota słownie, data wystawienia, termin płatności)
2. Dla BUSINESS: adres z pól `tenant.address1/address2`, dla PRIVATE: adres nieruchomości
3. Termin płatności = ostatni dzień miesiąca wystawienia
4. Mapuje placeholdery `{klucz}` z `rentInvoiceInputMappingJSON` na wartości
5. Zapisuje wartości do named ranges w arkuszu Google (`writeNamedRanges`)
6. Eksportuje zakładkę (lub cały plik) jako PDF (`exportSheetAsPdf`)
7. Opcjonalnie uploaduje PDF do Drive w strukturze `rok/miesiąc/`
8. Dołącza PDF jako załącznik do e-maila

**Rate limiting**: między każdym PDF odczekuje 4000ms (limit Google API: ~1 req/2s na arkusz).

### Progress bar

Szacowanie: `pdfCount * 4000 + 3000` ms. Pasek asymptotycznie osiąga 95%, przy zakończeniu skacze do 100%.

### Podgląd istniejących czynszów

Tabela na dole strony — wszystkie rachunki RENT dla wybranego miesiąca/roku, z linkami do najemców i nieruchomości.

---

## Media — Grupy rozliczeniowe

**Ścieżka**: `/media` (lista) + `/media/[groupId]` (rozliczenie)

### Koncepcja

Media (prąd, woda, ogrzewanie) są rozliczane przez grupy powiązane z arkuszami Google Sheets. Jeden arkusz = jedna formuła rozliczeniowa dla wielu lokali.

### Lista grup (`/media`)

CRUD grup:
- **Tworzenie/edycja**: dialog z polami:
  - Nazwa
  - Checkboxy nieruchomości (wiele-do-wielu)
  - ID arkusza Google
  - `inputMappingJSON` — pola wejściowe (odczyty liczników)
  - `outputMappingJSON` — wyniki (kwoty dla najemców)
- **Usuwanie**: z kaskadą (usuwa `SettlementGroupProperty`)

### Strona rozliczenia grupy (`/media/[groupId]`)

Przepływ rozliczenia mediów:

1. Wyświetla formularz z polami wejściowymi z `inputMappingJSON` (odczyty liczników).
   - Jeśli inputMapping ma pole `group`, pola są grupowane wizualnie.
2. Użytkownik wpisuje wartości (odczyty) i wybiera miesiąc/rok.
3. Kliknięcie "Przelicz i wystaw" → `processSettlement(groupId, inputValues, month, year)`:
   a. Zapisuje odczyty do arkusza (`writeInputValues`)
   b. Wymusza przeliczenie (`triggerRecalc` — dummy read A1)
   c. Odczytuje wyniki dla najemców (`readOutputValues`) z komórek z `outputMappingJSON`
   d. Tworzy rachunki `Invoice` (type=MEDIA) dla najemców, gdzie kwota > 0 i nie ma jeszcze rachunku za ten miesiąc
   e. Numer rachunku: `buildInvoiceNumber(month, year, invoiceSeqNumber, "MEDIA")`
   f. Wysyła e-maile do najemców z adresem e-mail (równolegle, bez PDF)
   g. Oznacza zadanie miesięczne MEDIA jako DONE

4. Wyświetla listę wystawionych rachunków MEDIA dla tej grupy w wybranym miesiącu.

**Walidacja**: sprawdza, czy `tenantId` z `outputMappingJSON` należy do nieruchomości w grupie.

---

## Import CSV (Transakcje bankowe)

**Ścieżka**: `/import`

### Obsługiwane banki

Parser (`csvParser.ts`) rozpoznaje formaty CSV z banków:
- **PKO BP**: delimiter `,`, kolumny: "Data operacji", "Kwota", "Opis transakcji", "Numer konta nadawcy/odbiorcy"
- **mBank**: delimiter `;`, kolumny: "#Data operacji", "#Kwota", "#Opis operacji", "#Numer konta"
- **Santander**: delimiter `;`, kolumny: "Data transakcji", "Kwota", "Tytuł", "Numer rachunku"
- **ING**: delimiter `;`, kolumny: "Data transakcji", "Kwota transakcji (waluta rachunku)", "Tytuł", "Dane kontrahenta"
- **Millenium**: delimiter `,`, kolumny: "Data transakcji", "Kwota", "Opis", "Rachunek nadawcy/odbiorcy"
- **Fallback**: generyczne mapowanie — szuka kolumn zawierających słowa kluczowe

Detekcja banku: na podstawie nagłówków CSV (case-insensitive, BOM-safe).

### Przetwarzanie kwot

Format polski: `1 234,56` → `1234.56`. Spacje usuwane, przecinek zamieniany na kropkę.

### Przetwarzanie dat

Obsługuje: `DD.MM.YYYY`, `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`.

### Przepływ importu

1. Użytkownik wybiera plik CSV
2. Plik czytany jako text na kliencie
3. `importCsvTransactions(csvContent)`:
   - Parse CSV
   - Dla każdej transakcji: `matchTransaction(bankAccount, tenants)`
   - Tworzy `Transaction` (type=BANK, status=MATCHED lub UNMATCHED)
   - Tworzy w batchach po 50 (optymalizacja dla SQLite/PostgreSQL)
4. Wyświetla statystyki: bank, łączna liczba, dopasowane, niedopasowane, pominięte

### Dopasowanie do najemców (`matcher.ts`)

Normalizacja konta: usuwa spacje, myślniki, prefix "PL".
`bankAccountsAsText` najemcy jest dzielony po `\n`, `,`, `;`.
Dopasowanie: dokładne OR suffix (np. skrócone konto bankowe pasuje do pełnego).

---

## Uzgadnianie transakcji (Reconcile)

**Ścieżka**: `/import/reconcile`

Lista transakcji ze statusem `UNMATCHED` (tylko type=BANK).

Dla każdej transakcji:
- Data, tytuł, konto nadawcy, kwota
- Dropdown z wyborem najemcy
- Przycisk "Przypisz" → `reconcileTransaction(txId, tenantId, saveAccount)`:
  - Zmienia status na MATCHED, przypisuje `tenantId`
  - Jeśli `saveAccount=true`: dopisuje numer konta do `bankAccountsAsText` najemcy (jeśli jeszcze nie ma)
  - Przy przypisaniu pokazuje dialog "Zapamiętać numer konta?" jeśli transakcja ma `bankAccount`
- Przycisk "Odrzuć" → `dismissTransaction(txId)` → status = DISMISSED

---

## Przypomnienia e-mail

**Ścieżka**: `/reminders`

### Model

Każde przypomnienie (`ReminderSchedule`) ma:
- Nazwę, dzień miesiąca, godzinę wysyłki
- Temat i treść e-maila
- Listę najemców (`ReminderTenant[]`)
- Status aktywności (`isActive`)
- `lastSentAt` — data ostatniej wysyłki

### CRUD

- Tworzenie/edycja: formularz dialogowy z wszystkimi polami + multi-select najemców
- Przełącznik aktywny/nieaktywny (toggle)
- Usuwanie: z kaskadą (`ReminderTenant` usuwa się automatycznie)

### Ręczna wysyłka

Przycisk "Wyślij teraz" → `sendReminderNow(id)`:
- Wysyła do wszystkich najemców z e-mailem
- Aktualizuje `lastSentAt = now()`
- Zwraca liczbę wysłanych/pominiętych

### Automatyczna wysyłka (Cron)

Endpoint `POST /api/cron/reminders` — wywoływany co godzinę przez Vercel Cron.
- Sprawdza bieżący dzień i godzinę
- Wysyła do przypomnień z pasującym `dayOfMonth` i `hour`
- Pomija, jeśli `lastSentAt` jest w bieżącym miesiącu (zabezpieczenie przed duplikatami)
- Autoryzacja: nagłówek `x-vercel-cron: 1` ALBO `Authorization: Bearer <CRON_SECRET>`

### Format e-maila

HTML z pozdrowieniem "Dzień dobry Imię Nazwisko" i treścią (znaki specjalne HTML-escaped, newlines → `<br>`).

---

## Ustawienia aplikacji

**Ścieżka**: `/settings`

Konfiguracja szablonu PDF rachunku czynszu:

1. **ID arkusza Google** (`rentInvoiceSpreadsheetId`) — arkusz-szablon rachunku. Zostaw puste = brak PDF.
2. **Mapowanie danych do arkusza** (`rentInvoiceInputMappingJSON`) — JSON tablica z obiektami `{ range, value }`:
   - `range` = nazwa named range w arkuszu Google
   - `value` = wartość statyczna lub z placeholderami `{klucz}`
   - Dostępne placeholdery: `{numer_rachunku}`, `{najemca}`, `{adres_1}`, `{adres_2}`, `{nip}`, `{miesiac}`, `{rok}`, `{kwota}`, `{kwota_slownie}`, `{data_wystawienia}`, `{termin_platnosci}`
3. **GID zakładki** (`rentInvoicePdfGid`) — opcjonalnie, do eksportu konkretnej zakładki
4. **ID folderu Drive** (`driveInvoicesFolderId`) — folder do zapisywania PDF. Musi być udostępniony kontu serwisowemu.

**Domyślne mapowanie** (pokazywane gdy `[] `): pełny szablon z named ranges: `numer_rachunku`, `data_wystawienia`, `termin_platnosci`, `nabywca_nazwa`, `nabywca_adres_1`, `nabywca_adres_2`, `nabywca_nip`, `opis_rachunku`, `do_zaplaty`, `do_zaplaty_slownie` itd.

---

## Model finansowy — "Skarbonka"

```
Saldo = Suma(Transakcje.amount) - Suma(Faktury.amount)
```

- **Rachunki** zmniejszają saldo (kwota ujemna w wyciągu)
- **Transakcje** (wpłaty) zwiększają saldo (kwota dodatnia w wyciągu)
- Brak parowania 1:1 między wpłatą a rachunkiem
- Status "opłacony" jest **symulowany**: zaczyna się od sumy wpłat, pokrywa rachunki od najstarszego do najnowszego. Jeśli kredyt się wyczerpie, nowsze rachunki są "zaległe".

**`calculateBalance(tenantId)`** (`lib/balance.ts`):
```
SUM(transactions.amount WHERE tenantId) - SUM(invoices.amount WHERE tenantId)
```

---

## Wyciąg najemcy (Statement)

`lib/statement.ts` — `getStatement(tenantId): StatementEntry[]`

Łączy rachunki i transakcje w jeden chronologiczny wyciąg:

- Rachunki: `amount = -kwota` (zmniejszają saldo), `entryType = "invoice"`
- Transakcje: `amount = +kwota` (zwiększają saldo), `entryType = "transaction"`

Każdy wpis ma `runningBalance` (bieżące saldo po operacji).

**Symulacja statusu opłacenia rachunków**:
1. `creditPool = totalInvoiceAmount + finalBalance`
2. Iteruj rachunki od najstarszego: jeśli `creditPool >= koszt rachunku` → opłacony, odejmij koszt. Inaczej zaległy.

**Typy wpisów w wyciągu**:
- Invoice: `Czynsz / Media / Inne — Mies Rok`
- Transaction BANK: `Przelew: tytuł`
- Transaction CASH: `Gotówka: tytuł`
- Transaction ADJUSTMENT: `Korekta: opis`

**Badge statusu**: `InvoiceStatusBadge` — zielony "Opłacone" / czerwony "Zaległe" (tylko dla Invoice).

---

## Numeracja rachunków

Format: `MM/YYYY/NNN`

- `MM` = miesiąc z zerem wiodącym
- `YYYY` = rok
- `NNN` = `invoiceSeqNumber + offset` z zerem wiodącym (3 cyfry)

Offsety według typu:

| Typ   | Offset | Przykład (seq=1) | Przykład (seq=2) |
|-------|--------|------------------|------------------|
| RENT  | 0      | /001             | /002             |
| MEDIA | 9      | /010             | /011             |
| OTHER | 19     | /020             | /021             |

Przykłady:
- Umowa seq=3, RENT, kwiecień 2025 → `04/2025/003`
- Umowa seq=3, MEDIA, kwiecień 2025 → `04/2025/012`

Numer jest stały dla danej umowy niezależnie od miesiąca.

Implementacja: `buildInvoiceNumber()` w `finance/actions.ts` i `media/[groupId]/actions.ts` (dwa identyczne duplikaty).

---

## Integracje zewnętrzne

### Resend (E-mail)

- Biblioteka: `resend`
- Klucz API: `RESEND_API_KEY`
- Nadawca: `RESEND_FROM` (domyślnie `BMT <noreply@example.com>`)
- Reply-To: `RESEND_REPLY_TO` (opcjonalne)
- Trzy typy e-maili: `sendRentEmail`, `sendMediaEmail`, `sendReminderEmail`
- Wszystkie formatują kwoty po polsku (PLN), mają HTML template
- `sendRentEmail` obsługuje załącznik PDF (opcjonalny)

### Google Sheets API (sheetsEngine.ts)

- Auth: Service Account JSON (`GOOGLE_SERVICE_ACCOUNT_JSON` — jako raw JSON lub base64)
- Scopes: `spreadsheets`, `drive`
- Funkcje:
  - `writeInputValues(spreadsheetId, inputMapping, values)` — batch update wartości w arkuszu
  - `triggerRecalc(spreadsheetId)` — dummy read A1 wymuszający przeliczenie
  - `readOutputValues(spreadsheetId, outputMapping)` — batch get wartości z wielu komórek
  - `writeNamedRanges(spreadsheetId, values)` — batch update przez named ranges (dla PDF czynszu)
  - `exportSheetAsPdf(spreadsheetId, gid?)` — eksport do PDF przez Drive export URL

### Google Drive API (driveEngine.ts)

- Auth: **OAuth2** (różne od Sheets — tu OAuth, nie Service Account)
- Zmienne: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`
- Funkcje:
  - `getOrCreateFolder(name, parentId?)` — szuka/tworzy folder w Drive
  - `ensureYearMonthFolder(year, month, rootFolderId)` — struktura `YYYY/MM/` w Drive
  - `uploadPdfToDrive(filename, buffer, folderId)` — upload pliku PDF
- Pliki są tworzone/szukane przez `supportsAllDrives: true`

### Kwota słownie po polsku (numberWords.ts)

`amountToWordsPLN(amount)` → np. `dwa tysiące pięćset złotych 00/100`

Obsługuje: miliony, tysiące, setki, dziesiątki, jedności. Prawidłowe odmiany (`tysiąc/tysiące/tysięcy`, `złoty/złote/złotych`).

---

## Zadania miesięczne (MonthlyTask)

Dwa typy: `RENT` i `MEDIA`. Jeden rekord na typ × miesiąc × rok.

- Tworzone automatycznie przy wejściu na stronę główną (`ensureMonthlyTasks`)
- Oznaczane jako DONE po wystawieniu czynszów / mediów (`markMonthlyTaskDone`)
- Wyświetlane na dashboardzie jako "Do zrobienia" lub "Zrobione"
- DONE zawiera `completedAt` timestamp

---

## Cron / automatyzacja

### Vercel Cron (`vercel.json`)

Konfiguracja cron job w Vercelu wywołuje endpoint co godzinę:
```
POST /api/cron/reminders
```

Autoryzacja: nagłówek `x-vercel-cron: 1` (od Vercel) lub `Authorization: Bearer <CRON_SECRET>`.

Logika: dopasowuje aktywne przypomnienia do bieżącego dnia i godziny, wysyła e-maile, aktualizuje `lastSentAt`, pomija jeśli już wysłano w tym miesiącu.

---

## Zmienne środowiskowe

| Zmienna                       | Wymagana | Opis                                             |
|-------------------------------|----------|--------------------------------------------------|
| `DATABASE_URL`                | TAK      | PostgreSQL connection string (przez pooler)      |
| `DIRECT_URL`                  | TAK      | PostgreSQL direct URL (dla migracji)            |
| `APP_PASSWORD`                | TAK      | Hasło do logowania                               |
| `NEXTAUTH_SECRET`             | TAK      | Sekret NextAuth                                  |
| `NEXTAUTH_URL`                | TAK      | URL aplikacji                                    |
| `RESEND_API_KEY`              | NIE*     | Klucz Resend (bez niego e-maile nie działają)   |
| `RESEND_FROM`                 | NIE      | Nadawca e-maili                                  |
| `RESEND_REPLY_TO`             | NIE      | Reply-To                                         |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | NIE*     | JSON konta serwisowego (Sheets + eksport PDF)   |
| `GOOGLE_OAUTH_CLIENT_ID`      | NIE*     | OAuth Client ID (Drive upload)                  |
| `GOOGLE_OAUTH_CLIENT_SECRET`  | NIE*     | OAuth Client Secret                              |
| `GOOGLE_OAUTH_REFRESH_TOKEN`  | NIE*     | OAuth Refresh Token                              |
| `CRON_SECRET`                 | NIE      | Sekret do autoryzacji crona (Bearer token)      |

\* Wymagane dla danych funkcji (e-mail / Sheets / Drive).

---

## Uwagi dla przepisania na nowy stack

### Kluczowe zachowania do zachowania

1. **Model salda "Skarbonka"** — brak parowania 1:1, status opłacenia symulowany od najstarszego.
2. **Numeracja rachunków** — stały `invoiceSeqNumber` per umowa + offset per typ.
3. **Unikalność rachunku** — `(tenantId, type, month, year)` unikalne.
4. **Tylko BUSINESS generuje rachunki i e-maile** — PRIVATE ignorowane w `generateRents`.
5. **Rate limiting przy PDF** — 4s delay między eksportami Sheets.
6. **Cron przypomnienia** — idempotentny (jeden raz per miesiąc per przypomnienie).
7. **Reconcile z zapamiętaniem konta** — opcja dopisania konta do `bankAccountsAsText`.
8. **Walidacja usuwania** — tenant nie może być usunięty z umowami; nieruchomość z najemcami.

### Dane przechowywane jako tekst (do zamiany na struktury)

- `bankAccountsAsText` — wolny tekst z numerami kont rozdzielonymi `\n,;`
- `inputMappingJSON` / `outputMappingJSON` / `rentInvoiceInputMappingJSON` — JSON jako string w bazie

W nowym stacku można to rozważyć jako oddzielne tabele lub typy JSONB w Supabase.

### Brak soft delete

Wszystkie operacje DELETE są twarde. Rozważyć `deletedAt` dla umów/najemców.

### Jeden użytkownik

Aplikacja jest single-tenant (jedno hasło, jeden admin). Brak ról/uprawnień.
