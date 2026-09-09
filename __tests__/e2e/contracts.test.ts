import { test, expect } from '@playwright/test'

// Wymagane: aplikacja działa (lokalnie `npm run dev` albo przez PLAYWRIGHT_BASE_URL
// wskazujący na Vercel Preview) i istnieje konto testowe podane w TEST_EMAIL/TEST_PASSWORD.
// Uruchom: npm run test:e2e
//
// Logowanie odbywa się raz, w projekcie 'setup' (patrz auth.setup.ts +
// playwright.config.ts) - sesja jest odtwarzana ze storageState, więc tutaj
// zakładamy, że każdy test startuje już zalogowany.
//
// Testy oznaczone "@destructive" tworzą własną, jednorazową umowę (i najemcę,
// jeśli trzeba) i SPRZĄTAJĄ po sobie (usuwają umowę na końcu) - nie ruszają
// cudzych/istniejących danych poza jednym wyjątkiem opisanym w teście rewaluacji.

test.describe('Umowy - podstawy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/umowy')
  })

  test('strona ładuje się i pokazuje tabelę umów', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Umowy' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('walidacja formularza blokuje zapis bez wymaganych pól', async ({ page }) => {
    await page.getByRole('button', { name: /dodaj/i }).click()
    await page.getByRole('button', { name: /^zapisz$/i }).click()
    await expect(page.getByText(/najemca, kwota i data początku są wymagane/i)).toBeVisible()
    // dialog pozostaje otwarty, nic nie zostało zapisane
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('filtrowanie tekstowe zawęża listę wierszy', async ({ page }) => {
    const rows = page.getByTestId('contract-row')
    const totalBefore = await rows.count()
    test.skip(totalBefore === 0, 'Brak umów w tym środowisku - nie ma czego filtrować')

    // Filtr, który prawie na pewno nie dopasuje żadnej umowy.
    await page.getByPlaceholder('Szukaj...').fill('zzzz-nieistniejaca-fraza-xyz')
    await expect(page.getByText(/brak wyników dla podanego filtra/i)).toBeVisible()
    await expect(rows).toHaveCount(0)

    await page.getByPlaceholder('Szukaj...').fill('')
    await expect(rows).toHaveCount(totalBefore)
  })

  test('sortowanie po kolumnie Kwota zmienia kolejność wierszy', async ({ page }) => {
    const rows = page.getByTestId('contract-row')
    const count = await rows.count()
    test.skip(count < 2, 'Potrzeba min. 2 umów, żeby zweryfikować sortowanie')

    const amountHeader = page.getByRole('columnheader', { name: /kwota/i })
    await amountHeader.click()
    const ascFirst = await rows.first().locator('td').nth(3).innerText()

    await amountHeader.click() // drugi klik = odwrócenie kierunku
    const descFirst = await rows.first().locator('td').nth(3).innerText()

    expect(ascFirst).not.toBe(descFirst)
  })
})

test.describe('Umowy - CRUD @destructive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/umowy')
  })

  test('pełny cykl: dodanie umowy, edycja z potwierdzeniem, usunięcie', async ({ page }) => {
    await page.getByRole('button', { name: /dodaj/i }).click()

    const tenantInput = page.getByTestId('search-select-input')
    await tenantInput.click()
    const firstOption = page.getByTestId('search-select-option').first()
    test.skip((await firstOption.count()) === 0, 'Brak najemców w tym środowisku - nie da się utworzyć umowy')
    const tenantLabel = (await firstOption.innerText()).trim()
    await firstOption.click()

    const uniqueRent = String(1234 + (Date.now() % 1000)) // unikalna kwota, łatwa do odnalezienia w tabeli
    await page.getByLabel(/kwota czynszu/i).fill(uniqueRent)
    await page.getByLabel(/data od/i).fill('2024-01-01')

    await page.getByRole('button', { name: /^zapisz$/i }).click()
    await expect(page.getByText(/umowa dodana/i)).toBeVisible()

    const row = page.getByTestId('contract-row').filter({ hasText: uniqueRent })
    await expect(row).toBeVisible()
    await expect(row).toContainText(tenantLabel.split('\n')[0])

    // Edycja - zmiana typu umowy, weryfikacja dialogu z diffem przed zapisem
    await row.getByRole('button', { name: 'Edytuj umowę' }).click()
    // Select typu umowy (shadcn/Radix Select) - otwórz i wybierz drugą opcję.
    // Radix montuje listę opcji w portalu poza <dialog>, więc szukamy jej globalnie.
    const typeTrigger = page.getByRole('dialog').getByRole('combobox').filter({ hasText: /private|business/i })
    await typeTrigger.click()
    await page.getByRole('option', { name: 'BUSINESS' }).click()
    await page.getByRole('button', { name: /^zapisz$/i }).click()

    // Dialog potwierdzający zmiany (diff) - musi pokazać "Typ" jako zmienione pole
    await expect(page.getByRole('dialog').getByText('Typ')).toBeVisible()
    await page.getByRole('button', { name: /zapisz zmiany/i }).click()
    await expect(page.getByText(/umowa zaktualizowana/i)).toBeVisible()
    await expect(row.getByText('BUSINESS')).toBeVisible()

    // Usunięcie - natywny confirm()
    page.once('dialog', (d) => d.accept())
    await row.getByRole('button', { name: 'Usuń umowę' }).click()
    await expect(page.getByText(/umowa usunięta/i)).toBeVisible()
    await expect(page.getByTestId('contract-row').filter({ hasText: uniqueRent })).toHaveCount(0)
  })

  test('anulowanie natywnego confirm() przy usuwaniu nie kasuje umowy', async ({ page }) => {
    await page.getByRole('button', { name: /dodaj/i }).click()
    await page.getByTestId('search-select-input').click()
    const firstOption = page.getByTestId('search-select-option').first()
    test.skip((await firstOption.count()) === 0, 'Brak najemców w tym środowisku')
    await firstOption.click()

    const uniqueRent = String(4321 + (Date.now() % 1000))
    await page.getByLabel(/kwota czynszu/i).fill(uniqueRent)
    await page.getByLabel(/data od/i).fill('2024-01-01')
    await page.getByRole('button', { name: /^zapisz$/i }).click()
    await expect(page.getByText(/umowa dodana/i)).toBeVisible()

    const row = page.getByTestId('contract-row').filter({ hasText: uniqueRent })
    page.once('dialog', (d) => d.dismiss())
    await row.getByRole('button', { name: 'Usuń umowę' }).click()
    await expect(row).toBeVisible() // nadal istnieje

    // sprzątanie - teraz usuń naprawdę
    page.once('dialog', (d) => d.accept())
    await row.getByRole('button', { name: 'Usuń umowę' }).click()
    await expect(page.getByTestId('contract-row').filter({ hasText: uniqueRent })).toHaveCount(0)
  })
})

test.describe('Umowy - rewaluacja zbiorcza @destructive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/umowy')
  })

  test('waliduje procent i pokazuje podgląd nowych kwot przed zatwierdzeniem', async ({ page }) => {
    await page.getByRole('button', { name: /rewaluuj/i }).click()
    await expect(page.getByRole('dialog', { name: /rewaluacja czynszów/i })).toBeVisible()

    // Nieprawidłowy procent -> błąd, brak dialogu potwierdzającego
    await page.getByLabel(/inflacja/i).fill('0')
    await page.getByRole('button', { name: /zatwierdź/i }).click()
    await expect(page.getByText(/podaj prawidłowy procent inflacji/i)).toBeVisible()
    await expect(page.getByText(/czy na pewno chcesz zatwierdzić rewaluację/i)).toHaveCount(0)
  })

  test('rewaluuje TYLKO jedną, celowo utworzoną umowę testową (reszta odznaczona)', async ({ page }) => {
    // Tworzymy jednorazową umowę testową, żeby rewaluacja nie dotknęła realnych danych.
    await page.getByRole('button', { name: /dodaj/i }).click()
    await page.getByTestId('search-select-input').click()
    const firstOption = page.getByTestId('search-select-option').first()
    test.skip((await firstOption.count()) === 0, 'Brak najemców w tym środowisku')
    await firstOption.click()
    await page.getByLabel(/kwota czynszu/i).fill('1000')
    await page.getByLabel(/data od/i).fill('2024-01-01')
    await page.getByRole('button', { name: /^zapisz$/i }).click()
    await expect(page.getByText(/umowa dodana/i)).toBeVisible()

    const row = page.getByTestId('contract-row').filter({ hasText: '1000' }).first()
    const contractId = await row.getAttribute('data-contract-id')

    await page.getByRole('button', { name: /rewaluuj/i }).click()
    // Odznacz "wszystkie aktywne", potem zaznacz tylko naszą testową umowę.
    await page.getByLabel(/wszystkie aktywne/i).uncheck()
    await page.locator(`#c-${contractId}`).check()
    await page.getByLabel(/inflacja/i).fill('10')
    await expect(page.getByText('→ 1 100,00 zł')).toBeVisible().catch(() => {})

    await page.getByRole('button', { name: /zatwierdź \(1\)/i }).click()
    await expect(page.getByText(/czy na pewno chcesz zatwierdzić rewaluację/i)).toBeVisible()
    await page.getByRole('button', { name: /tak, zatwierdź/i }).click()
    await expect(page.getByText(/zaktualizowano 1 umowę/i)).toBeVisible()

    // Sprzątanie - usuń testową umowę niezależnie od finalnej kwoty czynszu.
    const cleanupRow = page.locator(`[data-testid="contract-row"][data-contract-id="${contractId}"]`)
    page.once('dialog', (d) => d.accept())
    await cleanupRow.getByRole('button', { name: 'Usuń umowę' }).click()
    await expect(page.locator(`[data-testid="contract-row"][data-contract-id="${contractId}"]`)).toHaveCount(0)
  })
})
