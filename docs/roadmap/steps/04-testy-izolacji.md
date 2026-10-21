---
status: todo
---
# Krok 04: Testy izolacji kont (slice 6)

## Cel
Twardy dowód intencji misji: konto A nie widzi i nie zmienia danych B w żadnej tabeli ani w storage, anon nie widzi
nic. Packet: `/home/shiva/.openrig/workspace/projects/bmt-app/missions/multi-account/slices/09-s6-isolation-tests/SPEC.md`.

## Zakres
- Dwóch użytkowników testowych z prefiksem `E2E_TEST__` na bazie preview (tworzonych/sprzątanych przez setup testów).
- Testy integracyjne: macierz tabela z `owner_id` × select/insert/update/delete — klient z sesją A na danych B nie ma
  dostępu; anon widzi 0 wierszy. Lista tabel wyliczana z bazy (kolumna `owner_id`), żeby nowa tabela nie wypadła z testu.
- Ta sama macierz dla storage (`invoices`, `manual-uploads`).
- e2e: logowanie prawdziwym użytkownikiem testowym; obecne spec-i dalej przechodzą.

## Poza zakresem
- Nowe funkcje aplikacji, poprawki RLS wykraczające poza naprawę znalezionego przecieku (przeciek → opisz i napraw minimalnie albo BLOCKED).
- Promocja na produkcję.

## Kryteria akceptacji
- `npm run test:integration` zielone; raport macierzy tabela × operacja × wynik w PROGRESS.md lub pliku w `docs/`.
- e2e z logowaniem użytkownikiem testowym zielone na preview.
- `npm run typecheck`, `npm run lint`, `npm run test` = 0.
