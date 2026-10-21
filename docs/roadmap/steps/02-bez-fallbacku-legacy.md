---
status: todo
---
# Krok 02: Usunięcie fallbacku legacy (slice 4b)

## Cel
Insert bez `owner_id` kończy się błędem zamiast po cichu przypisać dane właścicielowi. `current_owner_id()` zwraca
samo `auth.uid()`. Packet: `/home/shiva/.openrig/workspace/projects/bmt-app/missions/multi-account/slices/07-s4b-drop-legacy-default/SPEC.md`.

## Zakres
- Migracja + rollback: `current_owner_id()` = `auth.uid()` (bez coalesce do `legacy_owner`); insert service rolą
  bez `owner_id` → błąd NOT NULL.
- `legacy_owner` zostaje tylko jako źródło nadawcy e-maili (`getLegacyOwnerId()` w `lib/email.ts`).
- Przegląd funkcji `security definer` (`handle_new_user`, `get_previous_meter_readings`, `prevent_delete_function`)
  i ścieżek bez sesji (import, `/odczyty/[token]`, trasy publiczne) pod kątem zapisów polegających na DEFAULT — popraw je.
- Test (integracyjny na preview albo SQL w migracji/asercji), że insert service rolą bez `owner_id` pada.
- Push na `dev`, deploy preview z `Migracje OK.`, e2e przez `workflow_dispatch`.

## Poza zakresem
- Usunięcie `legacy_owner` i `getLegacyOwnerId()` (krok 05 / slice 7), storage (krok 03), produkcja.

## Kryteria akceptacji
- `npm run typecheck`, `npm run lint`, `npm run test` = 0.
- Dowód (wynik testu lub SQL na preview), że insert bez `owner_id` zwraca błąd, a insert z sesją użytkownika nadal działa.
- Log builda preview zawiera `Migracje OK.`; e2e zielone dla SHA tego builda.
