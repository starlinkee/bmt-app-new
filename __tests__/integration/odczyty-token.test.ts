import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createTestDbClient, loose, purgeAllTestData } from '../../tests-support/db'
import { createContract, createProperty, createSettlementGroup, createTenant, uniq } from '../../tests-support/factories'
import { getPreviousMeterReadings, hasAlreadySubmitted, saveReadings } from '@/app/odczyty/[token]/actions'

// Publiczna strona odczytów liczników: jedyną autoryzacją jest token najemcy.
const db = createTestDbClient()
const ldb = loose(db)

const KEY = `E2E_TEST__licznik_${uniq()}`
const OTHER_KEY = `E2E_TEST__cudzy_${uniq()}`

type Side = { token: string; groupId: number }
let a: Side
let b: Side

async function setupSide(key: string): Promise<Side> {
  const property = await createProperty(db)
  const tenant = await createTenant(db, { propertyId: property.id })
  await createContract(db, tenant.id, { has_media_invoice: true, is_active: true })
  const group = await createSettlementGroup(db, { propertyIds: [property.id] })
  await ldb.from('settlement_groups').update({ tenant_reading_keys: { [String(tenant.id)]: [key] } }).eq('id', group.id)
  const { data } = await ldb.from('tenants').select('reading_token').eq('id', tenant.id).single()
  return { token: data!.reading_token as string, groupId: group.id }
}

beforeAll(async () => {
  a = await setupSide(KEY)
  b = await setupSide(OTHER_KEY)
})

afterAll(async () => {
  await purgeAllTestData(db)
})

async function readingRows(groupId: number) {
  const { data } = await ldb.from('media_meter_readings').select('key, value').eq('group_id', groupId)
  return data ?? []
}

describe('odczyty liczników - autoryzacja tokenem', () => {
  test('zły token -> Unauthorized, nic nie zapisano', async () => {
    await expect(saveReadings('00000000-0000-0000-0000-000000000000', a.groupId, 1, 2001, { [KEY]: '10' })).rejects.toThrow('Unauthorized')
    await expect(saveReadings('', a.groupId, 1, 2001, { [KEY]: '10' })).rejects.toThrow('Unauthorized')
    expect(await readingRows(a.groupId)).toHaveLength(0)
  })

  test('grupa innego najemcy -> Unauthorized (zapis i odczyt)', async () => {
    await expect(saveReadings(a.token, b.groupId, 1, 2001, { [OTHER_KEY]: '10' })).rejects.toThrow('Unauthorized')
    await expect(hasAlreadySubmitted(a.token, b.groupId, 1, 2001, [OTHER_KEY])).rejects.toThrow('Unauthorized')
    await expect(getPreviousMeterReadings(a.token, b.groupId, 2, 2001, [OTHER_KEY])).rejects.toThrow('Unauthorized')
    expect(await readingRows(b.groupId)).toHaveLength(0)
  })

  test('klucz spoza listy najemcy -> Unauthorized', async () => {
    await expect(saveReadings(a.token, a.groupId, 1, 2001, { [OTHER_KEY]: '10' })).rejects.toThrow('Unauthorized')
    expect(await readingRows(a.groupId)).toHaveLength(0)
  })

  test('poprawny token -> zapis i odczyt działają', async () => {
    expect(await hasAlreadySubmitted(a.token, a.groupId, 1, 2001, [KEY])).toBe(false)
    expect(await saveReadings(a.token, a.groupId, 1, 2001, { [KEY]: '12,5' })).toEqual({ success: true })
    expect(await hasAlreadySubmitted(a.token, a.groupId, 1, 2001, [KEY])).toBe(true)
    expect(await getPreviousMeterReadings(a.token, a.groupId, 2, 2001, [KEY])).toEqual({ [KEY]: 12.5 })
  })
})
