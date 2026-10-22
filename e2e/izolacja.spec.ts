import { test, expect } from './support/fixtures'
import { E2E_PREFIX, getTestOwnerId } from './support/db'

// Izolacja kont w UI (slice 6): zalogowane konto e2e nie widzi na liście najemców nikogo z danych
// właściciela legacy. Nazwisko czytamy kluczem service (poza UI) i nigdzie go nie wypisujemy.

test('lista najemców konta e2e nie zawiera najemców innego konta', async ({ page, db, makeTenant }) => {
  const ownerId = await getTestOwnerId(db)
  if (!ownerId) throw new Error('Brak E2E_LOGIN_EMAIL - nie wiadomo, które konto jest zalogowane.')

  const { data: legacy, error: legacyError } = await db.from('legacy_owner').select('owner_id').eq('id', 1).single()
  if (legacyError || !legacy) throw new Error(`Nie udało się odczytać legacy_owner: ${legacyError?.message}`)
  // Gdyby konto e2e było właścicielem legacy, test niczego by nie dowodził.
  expect(legacy.owner_id === ownerId).toBe(false)

  const created: { propertyId?: number; tenantId?: number } = {}
  try {
    const { data: existing } = await db.from('tenants').select('last_name').eq('owner_id', legacy.owner_id).limit(1)
    let foreignName = existing?.[0]?.last_name as string | undefined
    if (!foreignName) {
      // Właściciel legacy bez najemców: zakładamy mu wiersz testowy (posprzątany w finally).
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const { data: property, error: pe } = await db
        .from('properties')
        .insert({ owner_id: legacy.owner_id, name: `${E2E_PREFIX}Izolacja ${stamp}`, address1: 'ul. Testowa 1', type: 'Mieszkanie' })
        .select()
        .single()
      if (pe) throw new Error(`fixture properties: ${pe.message}`)
      created.propertyId = property.id
      foreignName = `${E2E_PREFIX}Izolacja obcy ${stamp}`
      const { data: tenant, error: te } = await db
        .from('tenants')
        .insert({ owner_id: legacy.owner_id, first_name: 'Obcy', last_name: foreignName, property_id: property.id })
        .select()
        .single()
      if (te) throw new Error(`fixture tenants: ${te.message}`)
      created.tenantId = tenant.id
    }

    // Kontrola pozytywna: własny najemca konta e2e jest na liście (lista nie jest pusta "na pusto").
    const own = await makeTenant()
    await page.goto('/najemcy')
    await expect(page.locator(`[data-tenant-id="${own.tenantId}"]`)).toBeVisible()

    const leaked = await page.locator('[data-testid="tenant-row"]', { hasText: foreignName }).count()
    expect(leaked === 0).toBe(true)

    // To samo przy filtrze tekstowym po nazwisku obcego najemcy: brak wyników.
    await page.getByPlaceholder('Szukaj...').fill(foreignName)
    await expect(page.getByText('Brak wyników dla podanego filtra')).toBeVisible()
  } finally {
    if (created.tenantId) await db.from('tenants').delete().eq('id', created.tenantId)
    if (created.propertyId) await db.from('properties').delete().eq('id', created.propertyId)
  }
})
