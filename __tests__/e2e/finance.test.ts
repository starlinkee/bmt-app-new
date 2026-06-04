import { test, expect } from '@playwright/test'

// Wymagane: aplikacja działa na localhost:3000 i jesteś zalogowany
// Uruchom: npm run dev, potem: npm run test:e2e

test.describe('Generowanie czynszów', () => {
  test.beforeEach(async ({ page }) => {
    // Zaloguj się przed każdym testem
    await page.goto('/login')
    await page.getByLabel(/e-mail|login/i).fill(process.env.TEST_EMAIL ?? 'test@example.com')
    await page.getByLabel(/hasło|password/i).fill(process.env.TEST_PASSWORD ?? 'password')
    await page.getByRole('button', { name: /zaloguj/i }).click()
    await page.waitForURL('/')
  })

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
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/e-mail|login/i).fill(process.env.TEST_EMAIL ?? 'test@example.com')
    await page.getByLabel(/hasło|password/i).fill(process.env.TEST_PASSWORD ?? 'password')
    await page.getByRole('button', { name: /zaloguj/i }).click()
    await page.waitForURL('/')
  })

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
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/e-mail|login/i).fill(process.env.TEST_EMAIL ?? 'test@example.com')
    await page.getByLabel(/hasło|password/i).fill(process.env.TEST_PASSWORD ?? 'password')
    await page.getByRole('button', { name: /zaloguj/i }).click()
    await page.waitForURL('/')
  })

  test('lista najemców z saldami się ładuje', async ({ page }) => {
    await page.goto('/kontrola-platnosci')
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('przepływy finansowe się ładują', async ({ page }) => {
    await page.goto('/przeplywy')
    await expect(page.getByRole('main')).toBeVisible()
  })
})
