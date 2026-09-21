import { test, expect } from './support/fixtures'

// Wszystkie testy w tym pliku operują wyłącznie na najemcach/nieruchomościach
// zakładanych przez fixture `makeTenant` (nazwy z prefiksem E2E_TEST__) i
// sprzątanych po teście — nigdy na realnych danych z bazy preview.

test.beforeEach(async ({ page }) => {
  await page.goto('/najemcy')
})

test('dodawanie najemcy przez UI', async ({ page, cleanupUiCreated, makeTenant }) => {
  // Nieruchomość zakładamy przez fixture (istniejący najemca z tej fixture
  // nie jest tu używany) - testujemy dodanie NOWEGO najemcy do niej przez
  // formularz UI, a nie przez `makeTenant`. W przeciwieństwie do kontraktu
  // w analogicznym teście w `umowy.spec.ts` (który jest dzieckiem najemcy
  // z fabryki i zostaje posprzątany przez jej teardown niezależnie od wyniku
  // testu), ten najemca jest bytem nadrzędnym, którego fabryka nie śledzi -
  // dlatego sprzątamy go bezpośrednio w bazie w `finally`, żeby nie zostawić
  // śmiecia w bazie preview nawet jeśli któraś z asercji poniżej zawiedzie.
  const { propertyName } = await makeTenant()

  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const lastName = `E2E_TEST__UI_Najemca ${unique}`

  cleanupUiCreated('tenant', lastName)

  await page.getByRole('button', { name: 'Dodaj' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nowy najemca' })

  await dialog.getByLabel('Imię *').fill('E2E')
  await dialog.getByLabel('Nazwisko *').fill(lastName)

  await dialog.getByTestId('search-select-input').click()
  await dialog.getByTestId('search-select-input').fill(propertyName)
  await dialog.getByTestId('search-select-option').filter({ hasText: propertyName }).click()

  await dialog.getByRole('button', { name: 'Zapisz' }).click()

  await expect(page.getByText('Najemca dodany.')).toBeVisible()

  const row = page.locator('[data-testid="tenant-row"]', { hasText: lastName })
  await expect(row).toBeVisible()
})

test('edycja najemcy', async ({ page, makeTenant }) => {
  const tenant = await makeTenant()
  await page.reload()

  const row = page.locator(`[data-tenant-id="${tenant.tenantId}"]`)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Edytuj najemcę' }).click()

  const dialog = page.getByRole('dialog', { name: 'Edytuj najemcę' })
  await dialog.getByLabel('Telefon').fill('600123456')
  await dialog.getByRole('button', { name: 'Zapisz' }).click()

  const confirmDialog = page.getByRole('dialog', { name: 'Potwierdź zmiany' })
  await confirmDialog.getByRole('button', { name: 'Zapisz zmiany' }).click()

  await expect(page.getByText('Najemca zaktualizowany.')).toBeVisible()
  await expect(row).toContainText('600123456')
})

test('usuwanie najemcy', async ({ page, makeTenant }) => {
  const tenant = await makeTenant()
  await page.reload()

  const row = page.locator(`[data-tenant-id="${tenant.tenantId}"]`)
  await expect(row).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: 'Usuń najemcę' }).click()

  await expect(page.getByText('Najemca usunięty.')).toBeVisible()
  await expect(row).toHaveCount(0)
})

test('filtr tekstowy i filtr fasetowy po nieruchomości', async ({ page, makeTenant }) => {
  const tenantA = await makeTenant()
  const tenantB = await makeTenant()
  await page.reload()

  const rowA = page.locator('[data-testid="tenant-row"]', { hasText: tenantA.fullName })
  const rowB = page.locator('[data-testid="tenant-row"]', { hasText: tenantB.fullName })
  await expect(rowA).toBeVisible()
  await expect(rowB).toBeVisible()

  // Filtr tekstowy (pasek "Szukaj...")
  await page.getByPlaceholder('Szukaj...').fill(tenantA.fullName)
  await expect(rowA).toBeVisible()
  await expect(rowB).toHaveCount(0)
  await page.getByPlaceholder('Szukaj...').fill('')

  // Filtr fasetowy "Nieruchomość" - każdy najemca z fixture ma własną, unikalną
  // nieruchomość, więc filtr po nieruchomości tenantaB izoluje wyłącznie jego wiersz.
  await page.getByRole('button', { name: 'Nieruchomość', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: tenantB.propertyName }).click()
  await page.keyboard.press('Escape')

  await expect(rowB).toBeVisible()
  await expect(rowA).toHaveCount(0)
})
