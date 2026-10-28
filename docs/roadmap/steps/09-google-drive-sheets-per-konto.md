---
status: todo
---
# Krok 09: Drive i Sheets per konto (slice 7d)

## Cel
Kopie arkuszy, zapis wartości i eksport PDF tokenem konta; koniec konta serwisowego i wspólnego refresh tokenu.

## Kontekst
Plan: `docs/plans/google-per-konto.md` (sekcje wskazane niżej). Decyzje D1–D10 przyjęte wg rekomendacji planu; D2 = (a) „In production, unverified”, bez weryfikacji Google na start, z listą dozwolonych adresów po stronie aplikacji. Sekcje 4, 8 (7d) i 9; D4, D5. Wymaga od VB (D9): klucz API Pickera w Google Cloud i włączone Drive/Sheets/Picker API.

## Zakres
- **Spike najpierw** (sekcja 9, pkt 1–2): czy `files.copy` szablonu wybranego w Pickerze i eksport PDF działają z tokenem `drive.file`; wynik w PROGRESS. Jeśli nie — zatrzymaj się i zgłoś VB wariant (zakres `spreadsheets`/wycofanie na konto serwisowe), nie zgaduj.
- `driveEngine`/`sheetsEngine` przyjmujące klienta konta; Picker w Ustawieniach (szablon i folder → `template_file_id`/`folder_id`); sprzątanie `rent_invoice_spreadsheet_id`/`drive_invoices_folder_id` z `app_config`.
- Usunięcie `getServiceAccountEmail()` i udostępniania kopii kontu serwisowemu; usunięcie `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_OAUTH_REFRESH_TOKEN` z `.env.example` i kodu.
- Zasada billingowa bez zmian: noty obciążeniowe z szablonu Google Sheets, bez własnego generowania PDF (`AGENTS.md`).

## Poza zakresem
Usunięcie `legacy_owner`, produkcja.

## Kryteria akceptacji
- Test integracyjny z zamockowanym Google: noty konta A powstają w jego Drive tokenem A; brak połączenia ⇒ blokada przed utworzeniem czegokolwiek (bez wierszy `media_settlements`, wynik `code: 'google_not_connected'`).
- E2E: wybór szablonu w Ustawieniach (mock Pickera) i blokada rozliczenia mediów bez połączenia.
- Zielone: typecheck, lint, test, test:integration, e2e; commit po polsku.
