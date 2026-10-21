# Kontekst

**Apka:** BMT — panel do zarządzania najmem (nieruchomości, najemcy, umowy, czynsze, media/noty obciążeniowe,
kontrola płatności, automatyzacje e-mail). Zasady rozliczeń: `AGENTS.md`.

**Zakres tej roadmapy (misja multi-konto):** wielu użytkowników, każdy z całkowicie oddzielnymi danymi
(`owner_id = auth.users.id`, izolacja przez RLS). Zrobione na `dev`: slice'y 0–3 (owner_id + RLS, klient z sesją,
`app_config` per konto; ostatni commit `28aa74e`). Zostało: crony per konto (4a), usunięcie fallbacku legacy (4b),
storage per konto (5), testy izolacji (6), plan Gmail/Google per konto (7). Stan i decyzje właściciela:
`multi-account-plan.md`. Packety slice'ów (szczegóły, proof contract):
`/home/shiva/.openrig/workspace/projects/bmt-app/missions/multi-account/slices/`.

**Stack:** Next.js (wersja z breaking changes — czytaj `node_modules/next/dist/docs/`), TypeScript, Supabase
(Postgres + RLS + Storage + Auth), Vercel (crony, deploy), Gmail/Google Sheets, Vitest + Playwright.

**Konwencje:**
- Gałąź `dev` (push = deploy preview, migracje lecą na buildzie Vercela). **`master`/produkcja: zakaz** bez osobnej zgody właściciela.
- Schemat bazy tylko przez `supabase/migrations` (+ plik rollback w `supabase/rollback/`), nigdy ręcznie w Studio.
- Service rola tylko tam, gdzie nie ma użytkownika (crony); zawsze `.eq('owner_id', …)` i jawne `owner_id` w zapisie.
- Na preview **nie uruchamiać cronów ręcznie** (realne e-maile); wyjątek: `generate-rents`.
- Dane testowe z prefiksem `E2E_TEST__`. Weryfikacja: `npm run typecheck && npm run lint && npm run test`, e2e przez
  `gh workflow run e2e.yml --ref dev -f base_url=<URL deployu>`.
- Teksty UI i commity po polsku.
