# Testy e2e (Playwright)

Uruchamiane **lokalnie**, ale celujące w konkretny deploy **preview** na Vercelu
i jego bazę Supabase (środowisko `preview`). Nie dotykają produkcji ani lokalnego
`next dev`.

## Konfiguracja (jednorazowo)

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

## Zasady, którymi kierują się te testy

- **Izolacja danych.** Każdy test sam zakłada potrzebnych najemców/nieruchomości
  przez `makeTenant()` / `makeContract()` (`e2e/support/fixtures.ts`) z nazwami
  oznaczonymi prefiksem `E2E_TEST__`, i sam po sobie sprząta. Baza preview jest
  współdzielona między wszystkimi Twoimi uruchomieniami, więc testy nigdy nie
  powinny operować na realnych rekordach ani zakładać, że są jedynym testem
  działającym w danej chwili na tej bazie.
- **Rewaluacja jest szczególnie wrażliwa** — dialog "Rewaluuj" domyślnie
  zaznacza WSZYSTKIE aktywne umowy w bazie, więc test ręcznie odznacza
  "Wszystkie aktywne" i zaznacza wyłącznie umowę testową przed zatwierdzeniem.
- **Media (noty obciążeniowe) nie są tu testowane** — ten przepływ realnie
  wysyła e-maile i generuje PDF-y przez Google Sheets, więc nie nadaje się do
  automatycznego, powtarzalnego uruchamiania; zostaje do ręcznej weryfikacji.

## Dodawanie kolejnych testów

Trzymaj się wzorca z `umowy.spec.ts`: dane wejściowe przez `makeTenant`/
`makeContract` (bezpośrednio w bazie, szybciej niż przez UI), a samo zachowanie
UI (formularz, filtry, dialogi potwierdzenia) klikane w przeglądarce. Jeśli
nowy element listy/tabeli nie ma jeszcze `data-testid`, warto go dodać przy
okazji zamiast opierać selektor na tekście czy klasach CSS.
