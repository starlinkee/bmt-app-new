import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '__tests__/e2e',
  timeout: 30_000,
  // Na preview (build produkcyjny na Vercelu) pierwsze żądania po zimnym starcie
  // bywają wolniejsze - jedno powtórzenie tylko tam, żeby nie maskować realnych błędów lokalnie.
  retries: process.env.CI ? 1 : 0,
  use: {
    // PLAYWRIGHT_BASE_URL pozwala uruchomić te same testy przeciwko
    // Vercel Preview zamiast localhost (patrz .github/workflows/preview-e2e.yml).
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Nie startuje automatycznie serwera — uruchom `npm run dev` osobno
  webServer: undefined,
})
