import { test as base, expect } from '@playwright/test'
import { createTestDbClient, E2E_PREFIX } from './db'

type Db = ReturnType<typeof createTestDbClient>

type TenantHandle = {
  propertyId: number
  propertyName: string
  tenantId: number
  fullName: string
}

type ContractOverrides = Partial<{
  contract_type: string
  rent_amount: number
  has_media_invoice: boolean
  start_date: string
  end_date: string | null
  is_active: boolean
}>

type PropertyOverrides = Partial<{
  name: string
  address1: string
  address2: string | null
  type: string
}>
type PropertyHandle = { propertyId: number; propertyName: string }

type SettlementGroupOverrides = Partial<{
  name: string
  spreadsheet_id: string
  property_ids: number[]
}>
type SettlementGroupHandle = { id: number; name: string }

type Fixtures = {
  db: Db
  makeTenant: () => Promise<TenantHandle>
  makeContract: (tenantId: number, overrides?: ContractOverrides) => Promise<{ id: number }>
  makeProperty: (overrides?: PropertyOverrides) => Promise<PropertyHandle>
  makeSettlementGroup: (overrides?: SettlementGroupOverrides) => Promise<SettlementGroupHandle>
}

export const test = base.extend<Fixtures>({
  db: async ({}, use) => {
    await use(createTestDbClient())
  },

  // Fabryka najemców: każde wywołanie zakłada świeżą nieruchomość + najemcę
  // z unikalną nazwą (prefiks E2E_TEST__), a po teście sprząta wszystko, co
  // powstało (umowy -> najemca -> nieruchomość), niezależnie od tego, czy
  // dana umowa powstała przez UI, czy przez `makeContract`.
  makeTenant: async ({ db }, use) => {
    const createdTenantIds: number[] = []
    const createdPropertyIds: number[] = []

    async function factory(): Promise<TenantHandle> {
      const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const propertyName = `${E2E_PREFIX}Nieruchomość ${unique}`
      const lastName = `${E2E_PREFIX}Najemca ${unique}`

      const { data: property, error: propertyError } = await db
        .from('properties')
        .insert({ name: propertyName, address1: 'ul. Testowa 1', type: 'RESIDENTIAL' })
        .select()
        .single()
      if (propertyError) throw propertyError
      createdPropertyIds.push(property.id)

      const { data: tenant, error: tenantError } = await db
        .from('tenants')
        .insert({
          tenant_type: 'PRIVATE',
          first_name: 'E2E',
          last_name: lastName,
          property_id: property.id,
          bank_accounts_as_text: '',
        })
        .select()
        .single()
      if (tenantError) throw tenantError
      createdTenantIds.push(tenant.id)

      return { propertyId: property.id, propertyName, tenantId: tenant.id, fullName: `E2E ${lastName}` }
    }

    await use(factory)

    for (const tenantId of createdTenantIds) {
      await db.from('contracts').delete().eq('tenant_id', tenantId)
      await db.from('tenants').delete().eq('id', tenantId)
    }
    for (const propertyId of createdPropertyIds) {
      await db.from('properties').delete().eq('id', propertyId)
    }
  },

  // Fabryka umów zakładanych bezpośrednio w bazie (z pominięciem UI) - do testów,
  // które sprawdzają edycję/usuwanie/filtrowanie/rewaluację, a nie samo tworzenie.
  // Sprzątanie umów następuje przy okazji sprzątania najemcy w `makeTenant`.
  makeContract: async ({ db }, use) => {
    async function factory(tenantId: number, overrides: ContractOverrides = {}) {
      const { data, error } = await db
        .from('contracts')
        .insert({
          contract_type: 'PRIVATE',
          rent_amount: 500,
          has_media_invoice: false,
          start_date: '2026-01-01',
          is_active: true,
          tenant_id: tenantId,
          ...overrides,
        })
        .select()
        .single()
      if (error) throw error
      return { id: data.id as number }
    }
    await use(factory)
  },

  // Fabryka nieruchomości bez najemcy — do testów nieruchomości, które nie
  // chcą przez to ciągnąć za sobą sprzątania najemcy/umów jak `makeTenant`.
  makeProperty: async ({ db }, use) => {
    const createdPropertyIds: number[] = []

    async function factory(overrides: PropertyOverrides = {}): Promise<PropertyHandle> {
      const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const propertyName = overrides.name ?? `${E2E_PREFIX}Nieruchomość ${unique}`

      const { data, error } = await db
        .from('properties')
        .insert({
          name: propertyName,
          address1: overrides.address1 ?? 'ul. Testowa 1',
          address2: overrides.address2 ?? undefined,
          type: overrides.type ?? 'Mieszkanie',
        })
        .select()
        .single()
      if (error) throw error
      createdPropertyIds.push(data.id)

      return { propertyId: data.id, propertyName }
    }

    await use(factory)

    for (const propertyId of createdPropertyIds) {
      await db.from('properties').delete().eq('id', propertyId)
    }
  },

  // Fabryka grup rozliczeniowych mediów, zakładanych bezpośrednio w bazie
  // (z pominięciem UI) - do testów edycji/usuwania/filtrowania.
  makeSettlementGroup: async ({ db }, use) => {
    const createdGroupIds: number[] = []

    async function factory(overrides: SettlementGroupOverrides = {}): Promise<SettlementGroupHandle> {
      const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const name = overrides.name ?? `${E2E_PREFIX}Grupa ${unique}`

      const { data, error } = await db
        .from('settlement_groups')
        .insert({ name, spreadsheet_id: overrides.spreadsheet_id ?? '' })
        .select()
        .single()
      if (error) throw error
      createdGroupIds.push(data.id)

      if (overrides.property_ids?.length) {
        await db.from('settlement_group_properties').insert(
          overrides.property_ids.map((propertyId) => ({
            settlement_group_id: data.id,
            property_id: propertyId,
          })),
        )
      }

      return { id: data.id, name }
    }

    await use(factory)

    for (const groupId of createdGroupIds) {
      await db.from('settlement_group_properties').delete().eq('settlement_group_id', groupId)
      await db.from('settlement_groups').delete().eq('id', groupId)
    }
  },
})

export { expect }
