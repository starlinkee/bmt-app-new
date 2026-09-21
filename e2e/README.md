# Testy e2e (Playwright)

Uruchamiane **w GitHub Actions** (`.github/workflows/e2e.yml`) po każdym udanym
deployu **preview** na Vercelu, przeciwko temu deployowi i jego bazie Supabase
(środowisko `preview`). Nie dotykają produkcji ani lokalnego `next dev`.
`scripts/push-preview.sh` czeka na wynik tego workflow, a dopiero potem otwiera PR dev → master (merge ręcznie na GitHubie).

## Sekrety w GitHubie (jednorazowo)

Settings → Secrets and variables → Actions → New repository secret:

| Sekret | Skąd |
|---|---|
| `VERCEL_PROTECTION_BYPASS_SECRET` | Vercel → projekt → Settings → Deployment Protection → Protection Bypass for Automation |
| `E2E_LOGIN_EMAIL` | e-mail testowego konta w aplikacji |
| `E2E_LOGIN_PASSWORD` | hasło tego konta |
| `E2E_SUPABASE_URL` | URL projektu Supabase używanego przez preview |
| `E2E_SUPABASE_SECRET_KEY` | klucz **secret** (`sb_secret_…`) tego projektu: Supabase → Settings → API Keys |

Klucze legacy (`eyJ…`, anon/service_role) są w Supabase wyłączone - potrzebny jest
nowy klucz secret.

## Uruchamianie lokalne (opcjonalnie)

Do ręcznego odpalenia `npm run test:e2e` na swoim komputerze:

1. `cp .env.e2e.example .env.e2e`
2. `E2E_BASE_URL` — URL deploya preview z Vercela.
3. `E2E_LOGIN_EMAIL` / `E2E_LOGIN_PASSWORD` — dane logowania testowego konta
   w aplikacji (nie musi być specjalnie zakładane — może to być Twoje zwykłe
   konto, jeśli nie przeszkadza Ci sesja zapisana lokalnie w `e2e/.auth/`).
4. `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — z projektu
   Supabase używanego przez środowisko `preview` (to samo, do którego pushuje
   `npm run db:push:preview`). Testy używają service role, żeby samodzielnie
   zakładać i sprzątać dane testowe z pominięciem UI.

## Uruchamianie

```
npm run test:e2e          # headless, cały pakiet
npm run test:e2e:ui       # tryb UI Playwrighta (podgląd krok po kroku)
npx playwright test umowy # tylko plik umowy.spec.ts
npx playwright show-report
```

## Co jest już pokryte

- `umowy.spec.ts` — dodawanie/edycja/usuwanie umowy, filtr tekstowy i fasetowy
  po najemcy, rewaluacja czynszu.
- `najemcy.spec.ts` — dodawanie/edycja/usuwanie najemcy, filtr tekstowy i
  fasetowy po nieruchomości.
- `nieruchomosci.spec.ts` — dodawanie/edycja/usuwanie nieruchomości, filtr
  tekstowy i fasetowy po typie.
- `media.spec.ts` — dodawanie/edycja/usuwanie grupy rozliczeniowej (mediów),
  filtr tekstowy. Tylko podstawowe akcje CRUD na samej grupie — generowanie
  not obciążeniowych jest świadomie pominięte, patrz niżej.

Niepokryte (świadomie, patrz sekcja "Zasady" niżej): generowanie i wysyłka
not obciążeniowych (rozlicz-media).
Niepokryte (jeszcze nie zaimplementowane): pozostałe moduły (kontrola
płatności, rozliczanie mediów, import, automatyzacje, ustawienia itd.).

## Zasady, którymi kierują się te testy

- **Izolacja danych.** Każdy test sam zakłada potrzebnych najemców/nieruchomości
  przez `makeTenant()` / `makeContract()` (`e2e/support/fixtures.ts`) z nazwami
  oznaczonymi prefiksem `E2E_TEST__`, i sam po sobie sprząta. Baza preview jest
  współdzielona między wszystkimi Twoimi uruchomieniami, więc testy nigdy nie
  powinny operować na realnych rekordach ani zakładać, że są jedynym testem
  działającym w danej chwili na tej bazie.
- **Sprzątanie jest obowiązkowe i głośne.** Rekordy z fabryk sprzątają się same;
  rekordy tworzone przez UI trzeba zarejestrować fixture'em
  `cleanupUiCreated(kind, name)` PRZED akcją w UI (nie `try/finally` z ręcznym
  `delete` - ten ginął przy timeoutach i połykał błędy FK). Helpery w
  `e2e/support/db.ts` rzucają błąd, gdy usunięcie się nie uda. Dodatkowo
  `e2e/global-teardown.ts` po całym przebiegu kasuje wszystko z prefiksem
  `E2E_TEST__` (siatka bezpieczeństwa po padniętych/ubitych testach).
- **Rewaluacja jest szczególnie wrażliwa** — dialog "Rewaluuj" domyślnie
  zaznacza WSZYSTKIE aktywne umowy w bazie, więc test ręcznie odznacza
  "Wszystkie aktywne" i zaznacza wyłącznie umowę testową przed zatwierdzeniem.
- **Samo generowanie not obciążeniowych nie jest tu testowane** — ten przepływ
  (rozlicz-media) realnie wysyła e-maile i generuje PDF-y przez Google Sheets,
  więc nie nadaje się do automatycznego, powtarzalnego uruchamiania; zostaje do
  ręcznej weryfikacji. `media.spec.ts` testuje wyłącznie CRUD na definicji
  grupy rozliczeniowej (nazwa, arkusz, przypisane nieruchomości), a nie samo
  liczenie/wysyłkę rozliczeń.

## Dodawanie kolejnych testów

Trzymaj się wzorca z `umowy.spec.ts`: dane wejściowe przez `makeTenant`/
`makeContract` (bezpośrednio w bazie, szybciej niż przez UI), a samo zachowanie
UI (formularz, filtry, dialogi potwierdzenia) klikane w przeglądarce. Jeśli
nowy element listy/tabeli nie ma jeszcze `data-testid`, warto go dodać przy
okazji zamiast opierać selektor na tekście czy klasach CSS.
