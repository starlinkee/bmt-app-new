import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '__tests__/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
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
