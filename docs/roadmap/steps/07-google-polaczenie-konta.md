---
status: todo
---
# Krok 07: Podłączenie konta Google (OAuth) i ekran w Ustawieniach (slice 7b)

## Cel
Konto łączy, widzi status i odłącza Google z poziomu `/ustawienia`.

## Kontekst
Plan: `docs/plans/google-per-konto.md` (sekcje wskazane niżej). Decyzje D1–D10 przyjęte wg rekomendacji planu; D2 = (a) „In production, unverified”, bez weryfikacji Google na start, z listą dozwolonych adresów po stronie aplikacji. Sekcje 5, 6 i 8 (7b). **Wymaga od VB (D9):** klient OAuth (web) i ekran zgody w Google Cloud, redirect URI dla preview i produkcji, `GOOGLE_OAUTH_CLIENT_ID/SECRET` w Vercel (preview). Jeśli ich brak — builder implementuje z zamockowanym Google i zgłasza blokadę dla testów na żywo; planner/builder dopisują do PROGRESS checklistę dla VB.

## Zakres
- Trasy `connect`/`callback`: `state` w ciasteczku HttpOnly, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, zakres `gmail.send`; wymiana kodu, kontrola przyznanych zakresów, zapis zaszyfrowanego tokenu.
- **Lista dozwolonych adresów Google** po stronie aplikacji (decyzja VB): callback sprawdza adres Google (userinfo) względem listy (np. zmienna `GOOGLE_CONNECT_ALLOWLIST`, adresy po przecinku); adres spoza listy ⇒ odmowa, brak zapisu tokenu, czytelny komunikat.
- `revoke` przy odłączeniu; sekcja „Google” w `/ustawienia` (statusy: niepołączono / połączono jako … / wymaga ponownego połączenia); baner `needs_reauth`.
- Checklista konfiguracji Google Cloud dla VB w `docs/` (klient, ekran zgody, „In production”, redirect URI, lista adresów).

## Poza zakresem
Wysyłka maili (7c), Drive/Sheets (7d), weryfikacja Google.

## Kryteria akceptacji
- Test integracyjny z zamockowanym Google (kod → tokeny → wiersze); adres spoza listy odrzucony.
- E2E: „Niepołączono” → po symulowanym callbacku „Połączono”; po `invalid_grant` status `needs_reauth`; odłączenie kasuje wiersz sekretu.
- Token nie pojawia się w odpowiedziach HTTP ani logach (test grep po odpowiedziach).
- Zielone: typecheck, lint, test, test:integration, e2e; commit po polsku.
