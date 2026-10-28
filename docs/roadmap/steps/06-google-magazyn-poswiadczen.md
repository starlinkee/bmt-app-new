---
status: done
---
# Krok 06: Magazyn poświadczeń Google (slice 7a)

## Cel
Bezpieczne tabele i moduł szyfrowania sekretów Google per konto (bez UI).

## Kontekst
Plan: `docs/plans/google-per-konto.md` (sekcje wskazane niżej). Decyzje D1–D10 przyjęte wg rekomendacji planu; D2 = (a) „In production, unverified”, bez weryfikacji Google na start, z listą dozwolonych adresów po stronie aplikacji. Sekcje 5 i 8 (7a).

## Zakres
- Migracja + rollback: `google_connections`, `google_credentials` (RLS jak w sekcji 5 planu; `authenticated` bez dostępu do `google_credentials`, `SELECT` na `google_connections` tylko własny wiersz; asercja w migracji).
- `lib/secret-box.ts`: AES‑256‑GCM, `key_version`, AAD = `owner_id`; klucz `GOOGLE_TOKEN_KEY_V<n>` z env (D3).
- Skrypt rotacji klucza (dry-run domyślnie).
- Rozszerzenie macierzy izolacji (krok 04) o nowe tabele.

## Poza zakresem
OAuth, UI, wysyłka maili, produkcja.

## Kryteria akceptacji
- Test jednostkowy: round-trip, odrzucenie zmanipulowanego szyfrogramu i szyfrogramu z innym `owner_id`.
- Macierz izolacji: konto A nie widzi ani nie zapisuje `google_credentials` konta B; `authenticated` bez dostępu do `google_credentials`.
- `Migracje OK.` w buildzie preview; typecheck, lint, test, test:integration, e2e zielone; commit po polsku.
