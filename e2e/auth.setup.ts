import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.resolve(__dirname, '.auth/user.json')

setup('zaloguj się i zapisz sesję', async ({ page }) => {
  const email = process.env.E2E_LOGIN_EMAIL
  const password = process.env.E2E_LOGIN_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Brak E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD — ustaw je w .env.e2e (patrz .env.e2e.example).',
    )
  }

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Hasło').fill(password)
  await page.getByRole('button', { name: 'Zaloguj się' }).click()

  await expect(page).toHaveURL('/')
  await page.context().storageState({ path: authFile })
})
