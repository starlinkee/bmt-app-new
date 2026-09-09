import { test as setup } from '@playwright/test'

// Global setup projektu Playwright (patrz playwright.config.ts -> projects: 'setup').
// Loguje się RAZ i zapisuje sesję (cookies/localStorage) do pliku - wszystkie
// pozostałe testy (projekt 'chromium', dependencies: ['setup']) startują już
// zalogowane, bez powtarzania pełnego cyklu logowania w każdym beforeEach.

const authFile = 'playwright/.auth/user.json'

setup('zaloguj i zapisz sesję', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/e-mail|login/i).fill(process.env.TEST_EMAIL ?? 'test@example.com')
  await page.getByLabel(/hasło|password/i).fill(process.env.TEST_PASSWORD ?? 'password')
  await page.getByRole('button', { name: /zaloguj/i }).click()
  await page.waitForURL('/')
  await page.context().storageState({ path: authFile })
})
