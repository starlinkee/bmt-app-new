---
status: todo
---
# Krok 03: Pliki per konto (slice 5)

## Cel
Pliki w bucketach `invoices` i `manual-uploads` leżą pod prefiksem `<owner_id>/`, a konto B nie pobierze pliku
konta A. Packet: `/home/shiva/.openrig/workspace/projects/bmt-app/missions/multi-account/slices/08-s5-storage-per-owner/SPEC.md`.

## Zakres
- Nowe zapisy pod `<owner_id>/...`; polityki storage oparte na `(storage.foldername(name))[1] = auth.uid()::text` (migracja + rollback).
- Istniejące pliki: skrypt kopiujący do prefiksu właściciela z porównaniem liczby obiektów przed/po i aktualizacją
  ścieżek zapisanych w bazie. Stare obiekty **nie są usuwane** w tym kroku (usunięcie dopiero za zgodą właściciela).
- Trasy `skill-files`, `attachments/[filename]`, `media-settlement-pdf/[...path]` na kliencie z sesją albo z jawnym
  sprawdzeniem właściciela; ścieżki plików w e-mailach per konto.
- Test: konto B dostaje 403/404 na plik konta A.
- Push na `dev`, deploy preview, skrypt kopiujący uruchomiony na preview, e2e przez `workflow_dispatch`.

## Poza zakresem
- Import zapisujący do `process.cwd()/data/attachments` (ulotny dysk Vercela).
- Usuwanie starych obiektów; kopiowanie plików na produkcji.

## Kryteria akceptacji
- `npm run typecheck`, `npm run lint`, `npm run test` = 0.
- Raport liczby obiektów przed/po kopiowaniu na preview (zgodne).
- Test „B nie pobiera pliku A” zielony; właściciel nadal pobiera swoje faktury i załączniki (e2e lub ręczny dowód).
- Log builda preview zawiera `Migracje OK.`; e2e zielone.
