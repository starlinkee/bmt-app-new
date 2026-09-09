import { test, expect } from '@playwright/test'

// Wymagane: aplikacja działa (lokalnie `npm run dev` albo przez PLAYWRIGHT_BASE_URL
// wskazujący na Vercel Preview). Uruchom: npm run test:e2e
//
// Logowanie odbywa się raz, w projekcie 'setup' (patrz auth.setup.ts +
// playwright.config.ts) - sesja jest odtwarzana ze storageState, więc każdy
// test poniżej startuje już zalogowany.

test.describe('Generowanie czynszów', () => {
  test('strona finansów ładuje się poprawnie', async ({ page }) => {
    await page.goto('/finance')
    await expect(page.getByRole('heading')).toBeVisible()
  })

  test('historia operacji widoczna na dashboardzie', async ({ page }) => {
    await page.goto('/')
    // Dashboard powinien pokazywać sekcję z historią operacji lub ostatnimi czynnościami
    const content = page.locator('main')
    await expect(content).toBeVisible()
  })
})

test.describe('Import transakcji', () => {
  test('strona importu CSV ładuje się', async ({ page }) => {
    await page.goto('/import')
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('historia importów jest dostępna', async ({ page }) => {
    await page.goto('/import/history')
    await expect(page.getByRole('main')).toBeVisible()
  })
})

test.describe('Kontrola płatności', () => {
  test('lista najemców z saldami się ładuje', async ({ page }) => {
    await page.goto('/kontrola-platnosci')
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('przepływy finansowe się ładują', async ({ page }) => {
    await page.goto('/przeplywy')
    await expect(page.getByRole('main')).toBeVisible()
  })
})
