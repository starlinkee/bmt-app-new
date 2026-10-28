import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))

const getStatement = vi.fn(async () => ({ rows: [] }))
const calculateBalance = vi.fn(async () => 123)
vi.mock('@/lib/statement', () => ({ getStatement: (...a: unknown[]) => (getStatement as (...a: unknown[]) => unknown)(...a) }))
vi.mock('@/lib/balance', () => ({ calculateBalance: (...a: unknown[]) => (calculateBalance as (...a: unknown[]) => unknown)(...a) }))

// Klient sesji: select na tenants zwraca wiersz tylko dla "własnego" najemcy (RLS).
let ownedTenantId: number | null = 1
function sessionClient() {
  const q = {
    select: () => q,
    eq: (_col: string, id: number) => {
      q.found = id === ownedTenantId
      return q
    },
    found: false,
    maybeSingle: async () => ({ data: q.found ? { id: ownedTenantId } : null, error: null }),
  }
  return { from: () => q }
}
;(globalThis as { __unitSessionClient?: unknown }).__unitSessionClient = sessionClient()

const { getTenantStatement, getTenantBalance } = await import('@/app/(dashboard)/najemcy/[id]/actions')

beforeEach(() => {
  getStatement.mockClear()
  calculateBalance.mockClear()
  ownedTenantId = 1
})

describe('wyciąg i saldo najemcy - własność przez sesję', () => {
  test('obcy tenantId -> rzuca i nie woła getStatement / calculateBalance', async () => {
    await expect(getTenantStatement(999)).rejects.toThrow('Not found')
    await expect(getTenantBalance(999)).rejects.toThrow('Not found')
    expect(getStatement).not.toHaveBeenCalled()
    expect(calculateBalance).not.toHaveBeenCalled()
  })

  test('własny tenantId -> zwraca dane', async () => {
    await expect(getTenantBalance(1)).resolves.toBe(123)
    await expect(getTenantStatement(1)).resolves.toEqual({ rows: [] })
    expect(getStatement).toHaveBeenCalledWith(1)
    expect(calculateBalance).toHaveBeenCalledWith(1)
  })
})
