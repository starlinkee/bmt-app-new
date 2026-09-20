import { test, expect } from './support/fixtures'

// Testy strony /media (grupy rozliczeniowe) - wyłącznie podstawowe akcje CRUD
// i filtrowanie. Samo generowanie not obciążeniowych (Google Sheets + PDF +
// e-mail) świadomie NIE jest tu testowane, patrz e2e/README.md.
//
// Wszystkie testy operują wyłącznie na grupach zakładanych przez fixture
// `makeSettlementGroup` (nazwy z prefiksem E2E_TEST__) i sprzątanych po
// teście — nigdy na realnych danych z bazy preview.

test.beforeEach(async ({ page }) => {
  await page.goto('/media')
})

test('dodawanie grupy rozliczeniowej przez UI', async ({ page, db }) => {
  // Ta grupa powstaje przez formularz UI (nie przez `makeSettlementGroup`),
  // więc nie jest śledzona przez żadną fabrykę - sprzątamy ją bezpośrednio
  // w bazie w `finally`, żeby nie zostawić śmiecia nawet jeśli asercja zawiedzie.
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const name = `E2E_TEST__UI_Grupa ${unique}`

  try {
    await page.getByRole('button', { name: 'Dodaj' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nowa grupa' })

    await dialog.getByLabel('Nazwa').fill(name)
    await dialog.getByRole('button', { name: 'Zapisz' }).click()

    await expect(page.getByText('Grupa dodana.')).toBeVisible()

    const row = page.locator('[data-testid="group-row"]', { hasText: name })
    await expect(row).toBeVisible()
  } finally {
    await db.from('settlement_groups').delete().eq('name', name)
  }
})

test('edycja grupy rozliczeniowej', async ({ page, makeSettlementGroup }) => {
  const group = await makeSettlementGroup()
  await page.reload()

  const row = page.locator(`[data-group-id="${group.id}"]`)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Edytuj grupę' }).click()

  const dialog = page.getByRole('dialog', { name: 'Edytuj grupę' })
  await dialog.getByLabel('ID arkusza Google').fill('e2e-test-spreadsheet-id')
  await dialog.getByRole('button', { name: 'Zapisz' }).click()

  const confirmDialog = page.getByRole('dialog', { name: 'Potwierdź zmiany' })
  await confirmDialog.getByRole('button', { name: 'Zapisz zmiany' }).click()

  await expect(page.getByText('Grupa zaktualizowana.')).toBeVisible()
  await expect(row).toContainText('e2e-test-spreadsheet-id')
})

test('usuwanie grupy rozliczeniowej', async ({ page, makeSettlementGroup }) => {
  const group = await makeSettlementGroup()
  await page.reload()

  const row = page.locator(`[data-group-id="${group.id}"]`)
  await expect(row).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: 'Usuń grupę' }).click()

  await expect(page.getByText('Grupa usunięta.')).toBeVisible()
  await expect(row).toHaveCount(0)
})

test('filtr tekstowy po nazwie grupy', async ({ page, makeSettlementGroup }) => {
  const groupA = await makeSettlementGroup()
  const groupB = await makeSettlementGroup()
  await page.reload()

  const rowA = page.locator('[data-testid="group-row"]', { hasText: groupA.name })
  const rowB = page.locator('[data-testid="group-row"]', { hasText: groupB.name })
  await expect(rowA).toBeVisible()
  await expect(rowB).toBeVisible()

  await page.getByPlaceholder('Szukaj...').fill(groupA.name)
  await expect(rowA).toBeVisible()
  await expect(rowB).toHaveCount(0)
})
