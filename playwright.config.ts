import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '__tests__/e2e',
  timeout: 30_000,
  // Na preview (build produkcyjny na Vercelu) pierwsze żądania po zimnym starcie
  // bywają wolniejsze - jedno powtórzenie tylko tam, żeby nie maskować realnych błędów lokalnie.
  retries: process.env.CI ? 1 : 0,
  // Testy nie dzielą stanu (każdy destructive test sam tworzy/sprząta swoje dane),
  // więc mogą śmiało lecieć równolegle - i w plikach, i wewnątrz nich.
  fullyParallel: true,
  // ubuntu-latest ma 4 rdzenie - jawnie ustawiamy, żeby nie polegać na domyślnym
  // wyliczeniu (i żeby wynik był przewidywalny lokalnie i w CI).
  workers: process.env.CI ? 4 : undefined,
  use: {
    // PLAYWRIGHT_BASE_URL pozwala uruchomić te same testy przeciwko
    // Vercel Preview zamiast localhost (patrz .github/workflows/preview-e2e.yml).
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    // Preview na Vercelu ma włączoną ochronę SSO (Deployment Protection) -
    // bez tego nagłówka każde żądanie z CI dostaje ekran logowania Vercela
    // zamiast aplikacji. Sekret "Protection Bypass for Automation" ustawiony
    // w Project Settings -> Deployment Protection na Vercelu.
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          'x-vercel-set-bypass-cookie': 'true',
        }
      : undefined,
  },
  projects: [
    {
      // Loguje się raz i zapisuje sesję do playwright/.auth/user.json
      // (patrz __tests__/e2e/auth.setup.ts) - reszta testów ją odtwarza,
      // zamiast przechodzić przez formularz logowania w każdym teście.
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  // Nie startuje automatycznie serwera — uruchom `npm run dev` osobno
  webServer: undefined,
})
