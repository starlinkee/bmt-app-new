---
status: todo
---
# Krok 10: Usunięcie getLegacyOwnerId() i legacy_owner (slice 7e)

## Cel
Koniec zależności od tabeli `legacy_owner` w kodzie, testach i bazie.

## Kontekst
Plan: `docs/plans/google-per-konto.md` (sekcje wskazane niżej). Decyzje D1–D10 przyjęte wg rekomendacji planu; D2 = (a) „In production, unverified”, bez weryfikacji Google na start, z listą dozwolonych adresów po stronie aplikacji. Sekcje 7 i 8 (7e); D7. Zależy od kroków 08 i 09 (`email.ts` i silniki Google już bez `getLegacyOwnerId`).

## Zakres
Kolejność z sekcji 7: (1) `skill-files` wg D7 (długoterminowo runner pisze pod `<owner_id>/ai-files/`, do czasu zmiany runnera zmienna `AI_FILES_OWNER_ID`); (2) testy, mocki i skrypty bez `legacy_owner` (jawne konto testowe zamiast właściciela z tabeli); (3) macierz izolacji i `isolation-matrix.md` bez tabeli; (4) dopiero potem migracja `DROP TABLE public.legacy_owner` + rollback (uuid z parametru) + `pg_dump` tabeli przed dropem; regeneracja `types/supabase.ts`; aktualizacja dokumentacji.

## Poza zakresem
Produkcja; zmiany runnera VPS poza repo (tylko opisz w PROGRESS).

## Kryteria akceptacji
- `grep -rn "legacy_owner\|getLegacyOwnerId" --include=*.ts --include=*.tsx --include=*.mjs .` zwraca tylko migracje historyczne i dokument planu.
- Macierz izolacji bez tabeli i zielona; test-strażnik zielony; rollback sprawdzony na preview (drop → rollback → drop).
- E2E: widok plików AI dla właściciela działa, dla innego konta nie (główna ścieżka i błąd).
- Zielone: typecheck, lint, test, test:integration, e2e; commit po polsku.
