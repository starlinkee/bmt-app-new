---
status: todo
---
# Krok 08: Wysyłka e-mail per konto przez Gmail API (slice 7c)

## Cel
Nadawca = konto; koniec `GMAIL_APP_PASSWORD` i `getLegacyOwnerId()` w `lib/email.ts`.

## Kontekst
Plan: `docs/plans/google-per-konto.md` (sekcje wskazane niżej). Decyzje D1–D10 przyjęte wg rekomendacji planu; D2 = (a) „In production, unverified”, bez weryfikacji Google na start, z listą dozwolonych adresów po stronie aplikacji. Sekcje 6 i 8 (7c); D6, D8, D10.

## Zakres
- `sendEmail` przez `gmail.users.messages.send` (MIME lokalnie, załączniki PDF), refresh tokenu z `google_credentials`, obsługa `invalid_grant` (⇒ `needs_reauth`).
- Zachowania z tabeli w sekcji 6: blokada ręcznych akcji z komunikatem „Aby wysłać e-mail, połącz Gmaila w Ustawieniach.”; crony — `skipped: 'google_not_connected'` bez wpisu w `reminder_dedup`; `google_reauth_required` dla błędu tokenu.
- Rozdzielenie `admin_email` (D8): „Od:” = adres Google konta, `admin_email` tylko odbiorca.
- Usunięcie martwego `sendRentEmail` (D10). Czynsze nadal bez maili i PDF (`AGENTS.md`).

## Poza zakresem
Drive/Sheets, usunięcie `legacy_owner`.

## Kryteria akceptacji
- Testy integracyjne (Gmail zamockowany): wysyłka konta A używa tokenu A, nie B; brak połączenia ⇒ komunikat i brak wpisu w `email_logs`; cron: konto bez połączenia ⇒ `skipped`, pozostałe wysyłają, `reminder_dedup` bez wpisu (rozszerzyć `crons.test.ts`).
- E2E: blokada wysyłki wyciągu bez połączenia (główny błąd) i wysyłka z połączeniem (mock).
- `grep GMAIL_APP_PASSWORD` w kodzie aplikacji = 0; zielone: typecheck, lint, test, test:integration, e2e; commit po polsku.
