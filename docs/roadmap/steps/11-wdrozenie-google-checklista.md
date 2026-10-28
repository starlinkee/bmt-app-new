---
status: todo
---
# Krok 11: Lista kontrolna wdrożenia Google na produkcję (slice 7f)

## Cel
Przygotować (nie wykonać) wdrożenie nowego modelu na produkcji — decyzja i działania po stronie VB.

## Kontekst
Plan: `docs/plans/google-per-konto.md` (sekcje wskazane niżej). Decyzje D1–D10 przyjęte wg rekomendacji planu; D2 = (a) „In production, unverified”, bez weryfikacji Google na start, z listą dozwolonych adresów po stronie aplikacji. Sekcja 8 (7f). Produkcja jest poza zakresem agentów.

## Zakres
Dokument `docs/plans/google-per-konto-wdrozenie.md`: kolejność kroków, `pg_dump` produkcji, konfiguracja klienta OAuth i zmiennych w Vercel (Production), ponowne połączenie Google przez właściciela (D5), ręczne testy not mediów i przypomnień, wyłączenie starych zmiennych (`GMAIL_APP_PASSWORD`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_OAUTH_REFRESH_TOKEN`), plan wycofania, kryterium przejścia na weryfikację Google (D2: > ok. 20 kont lub uciążliwe ostrzeżenie).

## Poza zakresem
Jakiekolwiek zmiany na produkcji, `git push` na master, zmiany kodu.

## Kryteria akceptacji
Dokument kompletny i spójny z krokami 06–10; repo bez zmian w kodzie; `npm run typecheck` = 0.
