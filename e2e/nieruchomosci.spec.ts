import { test, expect } from './support/fixtures'

// Wszystkie testy w tym pliku operują wyłącznie na nieruchomościach zakładanych
// przez fixture `makeProperty` (nazwy z prefiksem E2E_TEST__) i sprzątanych po
// teście — nigdy na realnych danych z bazy preview.

test.beforeEach(async ({ page }) => {
  await page.goto('/nieruchomosci')
})

test('dodawanie nieruchomości przez UI', async ({ page, db }) => {
  // Ta nieruchomość powstaje przez formularz UI (nie przez `makeProperty`),
  // więc nie jest śledzona przez żadną fabrykę - sprzątamy ją bezpośrednio
  // w bazie w `finally`, żeby nie zostawić śmiecia nawet jeśli asercja zawiedzie.
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const name = `E2E_TEST__UI_Nieruchomość ${unique}`

  try {
    await page.getByRole('button', { name: 'Dodaj' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nowa nieruchomość' })

    await dialog.getByLabel('Nazwa').fill(name)
    await dialog.getByLabel('Adres *').fill('ul. Testowa 99')
    await dialog.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Mieszkanie' }).click()

    await dialog.getByRole('button', { name: 'Zapisz' }).click()

    await expect(page.getByText('Nieruchomość dodana.')).toBeVisible()

    const row = page.locator('[data-testid="property-row"]', { hasText: name })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Mieszkanie')
  } finally {
    await db.from('properties').delete().eq('name', name)
  }
})

test('edycja nieruchomości', async ({ page, makeProperty }) => {
  const property = await makeProperty()
  await page.reload()

  const row = page.locator(`[data-property-id="${property.propertyId}"]`)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Edytuj nieruchomość' }).click()

  const dialog = page.getByRole('dialog', { name: 'Edytuj nieruchomość' })
  await dialog.getByLabel('Adres *').fill('ul. Nowa 5')
  await dialog.getByRole('button', { name: 'Zapisz' }).click()

  const confirmDialog = page.getByRole('dialog', { name: 'Potwierdź zmiany' })
  await confirmDialog.getByRole('button', { name: 'Zapisz zmiany' }).click()

  await expect(page.getByText('Nieruchomość zaktualizowana.')).toBeVisible()
  await expect(row).toContainText('ul. Nowa 5')
})

test('usuwanie nieruchomości', async ({ page, makeProperty }) => {
  const property = await makeProperty()
  await page.reload()

  const row = page.locator(`[data-property-id="${property.propertyId}"]`)
  await expect(row).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: 'Usuń nieruchomość' }).click()

  await expect(page.getByText('Nieruchomość usunięta.')).toBeVisible()
  await expect(row).toHaveCount(0)
})

test('filtr tekstowy i filtr fasetowy po typie', async ({ page, makeProperty }) => {
  const propA = await makeProperty({ type: 'Mieszkanie' })
  const propB = await makeProperty({ type: 'Lokal użytkowy' })
  await page.reload()

  const rowA = page.locator('[data-testid="property-row"]', { hasText: propA.propertyName })
  const rowB = page.locator('[data-testid="property-row"]', { hasText: propB.propertyName })
  await expect(rowA).toBeVisible()
  await expect(rowB).toBeVisible()

  // Filtr tekstowy (pasek "Szukaj...")
  await page.getByPlaceholder('Szukaj...').fill(propA.propertyName)
  await expect(rowA).toBeVisible()
  await expect(rowB).toHaveCount(0)
  await page.getByPlaceholder('Szukaj...').fill('')

  // Filtr fasetowy "Typ" - propA i propB mają różne, unikalnie rozpoznawalne
  // po nazwie wpisy, więc filtr po typie izoluje wyłącznie wiersz propB.
  await page.getByRole('button', { name: 'Typ', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Lokal użytkowy' }).click()
  await page.keyboard.press('Escape')

  await expect(rowB).toBeVisible()
  await expect(rowA).toHaveCount(0)
})
