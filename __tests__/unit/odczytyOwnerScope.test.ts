import { describe, test, expect, vi, beforeEach } from 'vitest'

// Publiczna strona odczytów działa rolą service (bez RLS): każde zapytanie po tokenie
// musi być zawężone do owner_id najemcy, a zapis odczytów ustawia owner_id jawnie.
type Call = { table: string; filters: [string, unknown][]; upsert?: Record<string, unknown>[] }
const calls: Call[] = []
const TENANT = {
  id: 7, owner_id: 'owner-A', first_name: 'A', last_name: 'B', property_id: 3,
  contracts: [{ is_active: true, has_media_invoice: true }],
}

function builder(table: string) {
  const call: Call = { table, filters: [] }
  calls.push(call)
  const result = () => {
    if (table === 'tenants') return { data: TENANT, error: null }
    if (table === 'settlement_group_properties') return { data: [{ settlement_group_id: 5 }], error: null }
    if (table === 'settlement_groups') return { data: [{ id: 5, name: 'G', tenant_reading_keys: { '7': ['woda'] } }], error: null }
    return { data: [], error: null }
  }
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'or']) b[m] = () => b
  for (const m of ['eq', 'in']) b[m] = (k: string, v: unknown) => (call.filters.push([k, v]), b)
  b.upsert = (rows: Record<string, unknown>[]) => ((call.upsert = rows), Promise.resolve({ error: null }))
  b.single = async () => result()
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res)
  return b
}

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: builder }) }))
vi.mock('@/lib/app-config', () => ({ readAppConfig: async () => ({ meter_reading_closed_message: null }) }))
vi.mock('@/lib/clock', () => ({ getCurrentDate: async () => new Date(2026, 8, 26) }))

import { getTenantReadingsContext, getPreviousMeterReadings, hasAlreadySubmitted, saveReadings } from '@/app/odczyty/[token]/actions'

const scoped = (c: Call) => c.filters.some(([k, v]) => k === 'owner_id' && v === 'owner-A')

beforeEach(() => {
  calls.length = 0
})

describe('/odczyty/[token] - zawężenie do owner_id', () => {
  test('kontekst: grupy i powiązania właściciela najemcy', async () => {
    const ctx = await getTenantReadingsContext('tok')
    expect(ctx?.ownerId).toBe('owner-A')
    for (const c of calls.filter((x) => x.table !== 'tenants')) expect(scoped(c), c.table).toBe(true)
  })

  test('odczyty poprzednie / już podane: media_meter_readings z filtrem owner_id', async () => {
    await getPreviousMeterReadings('tok', 5, 9, 2026, ['woda'])
    await hasAlreadySubmitted('tok', 5, 9, 2026, ['woda'])
    const readings = calls.filter((c) => c.table === 'media_meter_readings')
    expect(readings).toHaveLength(2)
    for (const c of readings) expect(scoped(c)).toBe(true)
  })

  test('zapis: owner_id jawnie w każdym wierszu upsertu', async () => {
    await saveReadings('tok', 5, 9, 2026, { woda: '12,5' })
    const up = calls.find((c) => c.upsert)
    expect(up?.upsert).toEqual([{ owner_id: 'owner-A', group_id: 5, month: 9, year: 2026, key: 'woda', value: 12.5 }])
  })

  test('grupa spoza kontekstu najemcy -> Unauthorized', async () => {
    await expect(saveReadings('tok', 99, 9, 2026, { woda: '1' })).rejects.toThrow('Unauthorized')
  })
})
