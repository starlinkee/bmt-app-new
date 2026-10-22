# Macierz izolacji kont (krok 04, slice 6)

Raport generuje test `__tests__/integration/isolation.test.ts` (nie edytować ręcznie). Dane: baza preview, dwie prawdziwe
sesje testowe A i B (logowanie hasłem, klucz anon) oraz sesja anon; storage: buckety `invoices` i `manual-uploads`.
Lista tabel jest wyliczana z bazy (OpenAPI PostgREST: kolumna `owner_id`); test-strażnik wywala się, gdy nowa tabela
nie ma wpisu w macierzy. `OK` = zachowanie zgodne z izolacją, `PRZECIEK` = naruszenie. W nawiasie: wynik zapytania.

## Tabele (A działa na danych B, anon bez sesji)

| tabela | A: SELECT wiersza B | A: UPDATE wiersza B | A: DELETE wiersza B | A: INSERT z owner_id=B | A: SELECT własnego | A: UPDATE własnego | A: INSERT bez owner_id | A: DELETE własnego | anon: SELECT | anon: INSERT | anon: UPDATE | anon: DELETE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `app_config` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (n/d: jeden wiersz na konto) | OK (n/d: jeden wiersz na konto) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `audit_log` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `contracts` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `email_logs` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `invoices` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `legacy_owner (A (authenticated))` | OK (42501) | OK (42501) | OK (42501) | OK (42501) | — | — | — | — | — | — | — | — |
| `legacy_owner (anon)` | OK (42501) | OK (42501) | OK (42501) | OK (42501) | — | — | — | — | — | — | — | — |
| `media_meter_readings` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `media_settlements` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `operation_log` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `profiles` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (n/d: jeden wiersz na konto) | OK (n/d: jeden wiersz na konto) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `properties` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `reminder_dedup` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `settlement_group_properties` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `settlement_groups` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `skill_prompts` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `tenants` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `transaction_amendments` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `transaction_staging` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |
| `transactions` | OK (0 wierszy) | OK (0 zmienionych) | OK (0 usuniętych) | OK (42501) | OK (1 wiersz) | OK (1 zmieniony) | OK (owner_id = A) | OK (1 usunięty) | OK (0 wierszy) | OK (42501) | OK (0 zmienionych) | OK (0 usuniętych) |

## Storage

| próba | wynik |
|---|---|
| invoices: A download pliku B | OK (odmowa) |
| invoices: A list <B>/ | OK (0 plików) |
| invoices: A nadpisanie pliku B | OK (odmowa) |
| invoices: A remove pliku B | OK (0 usuniętych, plik jest) |
| invoices: A signed URL pliku B | OK (odmowa) |
| invoices: A upload bez prefiksu | OK (odmowa) |
| invoices: A upload pod <B>/ | OK (odmowa) |
| invoices: A własny plik (upload/list/download/signed/remove) | OK (działa) |
| invoices: anon upload/list/download/signed/remove | OK (odmowa) |
| manual-uploads: A download pliku B | OK (odmowa) |
| manual-uploads: A list <B>/ | OK (0 plików) |
| manual-uploads: A nadpisanie pliku B | OK (odmowa) |
| manual-uploads: A remove pliku B | OK (0 usuniętych, plik jest) |
| manual-uploads: A signed URL pliku B | OK (odmowa) |
| manual-uploads: A upload bez prefiksu | OK (odmowa) |
| manual-uploads: A upload pod <B>/ | OK (odmowa) |
| manual-uploads: A własny plik (upload/list/download/signed/remove) | OK (działa) |
| manual-uploads: anon upload/list/download/signed/remove | OK (odmowa) |

## Wyjątki

- `legacy_owner`: tylko service role (`REVOKE ALL` dla authenticated i anon); wiersze `legacy_owner (…)` w tabeli wyżej to próby odczytu i zmian.
- `system_settings`: tabela globalna (flagi środowiska), celowo bez `owner_id`; zamknięta dla authenticated i anon (`REVOKE ALL`).
- `profiles`: klucz `id` = id konta (bez `owner_id`); dopisana do macierzy jawnie. Brak polityki INSERT/DELETE, więc te operacje są odrzucane.
- `app_config` i `profiles` mają jeden wiersz na konto (zakłada go trigger `handle_new_user`), więc próby INSERT/DELETE własnego wiersza są pominięte (n/d).
