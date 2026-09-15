import { test, expect } from './support/fixtures'
import type { Locator } from '@playwright/test'

// Dialog "Rewaluuj" ma autoFocus na polu inflacji i animację otwierania -
// pierwsze kliknięcie w checkbox tuż po otwarciu bywa gubione (base-ui
// przełącza fokus w tym samym momencie). Ponawiamy klik, aż stan faktycznie
// się zmieni, zamiast polegać na pojedynczym click()/check().
async function setChecked(locator: Locator, checked: boolean) {
  await expect(async () => {
    if ((await locator.isChecked()) !== checked) await locator.click()
    expect(await locator.isChecked()).toBe(checked)
  }).toPass({ timeout: 10_000 })
}

// Wszystkie testy w tym pliku operują wyłącznie na najemcach/nieruchomościach/umowach
// zakładanych przez fixture'y `makeTenant` / `makeContract` (nazwy z prefiksem
// E2E_TEST__) i sprzątanych po teście — nigdy na realnych danych z bazy preview.

test.beforeEach(async ({ page }) => {
  await page.goto('/umowy')
})

test('dodawanie umowy przez UI', async ({ page, makeTenant }) => {
  const tenant = await makeTenant()

  await page.getByRole('button', { name: 'Dodaj' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nowa umowa' })

  await dialog.getByTestId('search-select-input').click()
  await dialog.getByTestId('search-select-input').fill(tenant.fullName)
  await dialog.getByTestId('search-select-option').filter({ hasText: tenant.fullName }).click()

  await dialog.getByPlaceholder('2500.00').fill('500')
  await dialog.locator('input[type="date"]').fill('2026-01-01')
  await dialog.getByRole('button', { name: 'Zapisz' }).click()

  await expect(page.getByText('Umowa dodana.')).toBeVisible()

  const row = page.locator('[data-testid="contract-row"]', { hasText: tenant.fullName })
  await expect(row).toBeVisible()
  await expect(row).toContainText('500,00 zł')
})

test('edycja umowy', async ({ page, makeTenant, makeContract }) => {
  const tenant = await makeTenant()
  const contract = await makeContract(tenant.tenantId, { rent_amount: 400 })
  await page.reload()

  const row = page.locator(`[data-contract-id="${contract.id}"]`)
  await expect(row).toContainText('400,00 zł')
  await row.getByRole('button', { name: 'Edytuj umowę' }).click()

  const dialog = page.getByRole('dialog', { name: 'Edytuj umowę' })
  const amountInput = dialog.getByPlaceholder('2500.00')
  await amountInput.fill('450')
  await dialog.getByRole('button', { name: 'Zapisz' }).click()

  const confirmDialog = page.getByRole('dialog', { name: 'Potwierdź zmiany' })
  await confirmDialog.getByRole('button', { name: 'Zapisz zmiany' }).click()

  await expect(page.getByText('Umowa zaktualizowana.')).toBeVisible()
  await expect(row).toContainText('450,00 zł')
})

test('usuwanie umowy', async ({ page, makeTenant, makeContract }) => {
  const tenant = await makeTenant()
  const contract = await makeContract(tenant.tenantId)
  await page.reload()

  const row = page.locator(`[data-contract-id="${contract.id}"]`)
  await expect(row).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: 'Usuń umowę' }).click()

  await expect(page.getByText('Umowa usunięta.')).toBeVisible()
  await expect(row).toHaveCount(0)
})

test('filtr tekstowy i filtr fasetowy po najemcy', async ({ page, makeTenant, makeContract }) => {
  const tenantA = await makeTenant()
  const tenantB = await makeTenant()
  await makeContract(tenantA.tenantId)
  await makeContract(tenantB.tenantId)
  await page.reload()

  const rowA = page.locator('[data-testid="contract-row"]', { hasText: tenantA.fullName })
  const rowB = page.locator('[data-testid="contract-row"]', { hasText: tenantB.fullName })
  await expect(rowA).toBeVisible()
  await expect(rowB).toBeVisible()

  // Filtr tekstowy (pasek "Szukaj...")
  await page.getByPlaceholder('Szukaj...').fill(tenantA.fullName)
  await expect(rowA).toBeVisible()
  await expect(rowB).toHaveCount(0)
  await page.getByPlaceholder('Szukaj...').fill('')

  // Filtr fasetowy "Najemca"
  await page.getByRole('button', { name: 'Najemca', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: tenantB.fullName }).click()
  await page.keyboard.press('Escape')

  await expect(rowB).toBeVisible()
  await expect(rowA).toHaveCount(0)
})

test('rewaluacja czynszu', async ({ page, makeTenant, makeContract }) => {
  const tenant = await makeTenant()
  const contract = await makeContract(tenant.tenantId, { rent_amount: 500, is_active: true })
  await page.reload()

  await page.getByRole('button', { name: 'Rewaluuj' }).click()
  const dialog = page.getByRole('dialog', { name: 'Rewaluacja czynszów' })

  // WAŻNE: dialog domyślnie zaznacza WSZYSTKIE aktywne umowy w bazie (nie tylko
  // testową) — na współdzielonej bazie preview trzeba to odznaczyć i zaznaczyć
  // ręcznie wyłącznie naszą umowę, żeby nie przeliczyć cudzych czynszów.
  // Checkbox (base-ui) renderuje DWA elementy pod tym samym id: widoczny
  // (role="checkbox", z dostępną nazwą z etykiety) i ukryty natywny <input>
  // poza viewportem (do semantyki formularza). CSS `#id` trafia w ten ukryty,
  // więc celujemy w rolę + nazwę dostępności zamiast w selektor po id.
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await setChecked(dialog.getByRole('checkbox', { name: /^Wszystkie aktywne/ }), false)
  await expect(dialog.getByText(/^Zaznaczono: /)).toHaveText(/^Zaznaczono: 0 z /)
  await setChecked(dialog.getByRole('checkbox', { name: new RegExp(`^${escapeRegExp(tenant.fullName)}`) }), true)

  await expect(dialog.getByText(/^Zaznaczono: /)).toHaveText(/^Zaznaczono: 1 z /)
  await dialog.getByPlaceholder('np. 3.6').fill('10')
  await expect(dialog.locator(`label[for="c-${contract.id}"]`)).toContainText('550,00 zł')

  await dialog.getByRole('button', { name: 'Zatwierdź (1)' }).click()
  const confirmDialog = page.getByRole('dialog', { name: 'Czy na pewno chcesz zatwierdzić rewaluację?' })
  await confirmDialog.getByRole('button', { name: 'Tak, zatwierdź' }).click()

  await expect(page.getByText('Zaktualizowano 1 umowę.')).toBeVisible()
  await expect(page.locator(`[data-contract-id="${contract.id}"]`)).toContainText('550,00 zł')
})
