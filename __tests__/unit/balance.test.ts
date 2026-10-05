import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './helpers/fakeSupabase'

let db: FakeSupabase
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db }))

const { calculateBalance } = await import('@/lib/balance')

const tx = (amount: number, status: string, tenant_id = 1) => ({ tenant_id, amount, status })
const inv = (amount: number, tenant_id = 1) => ({ tenant_id, amount })

beforeEach(() => {
  db = createFakeSupabase()
})

describe('calculateBalance', () => {
  test('brak danych -> 0', async () => {
    db = createFakeSupabase({ transactions: [], invoices: [] })
    expect(await calculateBalance(1)).toBe(0)
  })

  test('czynsz 1000, wpłata 400 -> zaległość -600', async () => {
    db = createFakeSupabase({ transactions: [tx(400, 'MATCHED')], invoices: [inv(1000)] })
    expect(await calculateBalance(1)).toBe(-600)
  })

  test('wpłata wyższa niż rachunki -> nadpłata', async () => {
    db = createFakeSupabase({ transactions: [tx(1500, 'MANUAL')], invoices: [inv(1000)] })
    expect(await calculateBalance(1)).toBe(500)
  })

  test('wpłata równa rachunkom -> 0', async () => {
    db = createFakeSupabase({ transactions: [tx(1000, 'MATCHED')], invoices: [inv(1000)] })
    expect(await calculateBalance(1)).toBe(0)
  })

  test('sumuje MATCHED i MANUAL oraz wiele rachunków', async () => {
    db = createFakeSupabase({
      transactions: [tx(300, 'MATCHED'), tx(200, 'MANUAL')],
      invoices: [inv(1000), inv(250)],
    })
    expect(await calculateBalance(1)).toBe(-750)
  })

  test.each([
    'REJECTED_OWN_TRANSFER',
    'REJECTED_DUPLICATE',
    'REJECTED_OTHER',
    'UNMATCHED',
    'SKIPPED',
    'PENDING',
    'SOME_FUTURE_STATUS',
  ])('transakcja o statusie %s nie wpływa na saldo', async (status) => {
    db = createFakeSupabase({ transactions: [tx(400, 'MATCHED'), tx(999, status)], invoices: [inv(1000)] })
    expect(await calculateBalance(1)).toBe(-600)
  })

  test('nie uwzględnia danych innego najemcy', async () => {
    db = createFakeSupabase({
      transactions: [tx(400, 'MATCHED', 1), tx(5000, 'MATCHED', 2)],
      invoices: [inv(1000, 1), inv(7000, 2)],
    })
    expect(await calculateBalance(1)).toBe(-600)
    expect(await calculateBalance(2)).toBe(-2000)
  })

  test('kwoty jako stringi (numeric z Postgresa) są sumowane liczbowo', async () => {
    db = createFakeSupabase({
      transactions: [{ tenant_id: 1, amount: '400.50', status: 'MATCHED' }],
      invoices: [{ tenant_id: 1, amount: '1000.25' }],
    })
    expect(await calculateBalance(1)).toBeCloseTo(-599.75, 2)
  })
})
