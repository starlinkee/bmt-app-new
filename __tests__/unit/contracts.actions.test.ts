import { describe, test, expect, vi, beforeEach } from 'vitest'

// Server actions używają next/cache (revalidatePath) - poza działającym requestem
// Next.js to no-op, więc mockujemy je zamiast ciągnąć cały runtime.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const logAuditMock = vi.fn()
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAuditMock(...args) }))

/**
 * Minimalny, w pełni kontrolowany "łańcuch zapytań" imitujący supabase-js
 * query buildera: każda metoda zwraca ten sam obiekt (chainable), a `await`
 * na nim rozwiązuje się do skonfigurowanego rezultatu ({data, error}).
 * Dzięki temu testujemy prawdziwą logikę z actions.ts bez łączenia się z bazą.
 */
function chain(result: { data?: unknown; error: unknown; count?: number }) {
  const obj: Record<string, unknown> = {}
  const self = () => obj
  obj.select = vi.fn(self)
  obj.insert = vi.fn(self)
  obj.update = vi.fn(self)
  obj.delete = vi.fn(self)
  obj.eq = vi.fn(self)
  obj.order = vi.fn(self)
  obj.single = vi.fn(self)
  obj.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return obj
}

const fromMock = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
}))

// Import DOPIERO po zdefiniowaniu mocków powyżej.
const {
  getContracts,
  createContract,
  updateContract,
  deleteContract,
  revaluateContract,
  getContractStats,
} = await import('@/app/(dashboard)/umowy/actions')

beforeEach(() => {
  fromMock.mockReset()
  logAuditMock.mockReset()
})

describe('getContracts', () => {
  test('zwraca dane i pyta o tabelę contracts z relacją tenants/properties', async () => {
    const rows = [{ id: 1 }]
    const builder = chain({ data: rows, error: null })
    fromMock.mockReturnValueOnce(builder)

    const result = await getContracts()

    expect(fromMock).toHaveBeenCalledWith('contracts')
    expect(builder.select).toHaveBeenCalledWith('*, tenants(first_name, last_name, properties(name))')
    expect(result).toBe(rows)
  })

  test('rzuca wyjątek gdy Supabase zwróci błąd', async () => {
    const builder = chain({ data: null, error: new Error('db down') })
    fromMock.mockReturnValueOnce(builder)

    await expect(getContracts()).rejects.toThrow('db down')
  })
})

describe('createContract', () => {
  const payload = {
    contract_type: 'PRIVATE',
    rent_amount: 2500,
    has_media_invoice: false,
    start_date: '2024-01-01',
    is_active: true,
    tenant_id: 1,
  }

  test('zapisuje umowę i loguje CREATE do audytu', async () => {
    const created = { id: 10, ...payload }
    const builder = chain({ data: created, error: null })
    fromMock.mockReturnValueOnce(builder)

    await createContract(payload)

    expect(builder.insert).toHaveBeenCalledWith(payload)
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: 'createContract',
        tableName: 'contracts',
        operation: 'CREATE',
        recordId: 10,
        afterData: created,
      }),
    )
  })

  test('przy błędzie Supabase loguje errorData i rzuca wyjątek zamiast cichego niepowodzenia', async () => {
    const dbError = { message: 'foreign key violation' }
    const builder = chain({ data: null, error: dbError })
    fromMock.mockReturnValueOnce(builder)

    await expect(createContract(payload)).rejects.toEqual(dbError)
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'CREATE', errorData: dbError }),
    )
  })
})

describe('updateContract', () => {
  test('aktualizuje tylko przekazane pola i loguje before/after', async () => {
    const before = { id: 5, rent_amount: 1000, is_active: true }
    const after = { id: 5, rent_amount: 1200, is_active: true }
    const selectBuilder = chain({ data: before, error: null })
    const updateBuilder = chain({ data: after, error: null })
    fromMock.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(updateBuilder)

    await updateContract(5, { rent_amount: 1200 })

    expect(updateBuilder.update).toHaveBeenCalledWith({ rent_amount: 1200 })
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'UPDATE', recordId: 5, beforeData: before, afterData: after }),
    )
  })

  test('przy błędzie loguje errorData wraz z before i rzuca wyjątek', async () => {
    const before = { id: 5, rent_amount: 1000 }
    const dbError = { message: 'constraint' }
    const selectBuilder = chain({ data: before, error: null })
    const updateBuilder = chain({ data: null, error: dbError })
    fromMock.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(updateBuilder)

    await expect(updateContract(5, { rent_amount: -1 })).rejects.toEqual(dbError)
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'UPDATE', beforeData: before, errorData: dbError }),
    )
  })
})

describe('deleteContract', () => {
  test('pobiera stan przed usunięciem i loguje DELETE', async () => {
    const before = { id: 7, rent_amount: 1000 }
    const selectBuilder = chain({ data: before, error: null })
    const deleteBuilder = chain({ data: null, error: null })
    fromMock.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(deleteBuilder)

    await deleteContract(7)

    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'DELETE', recordId: 7, beforeData: before }),
    )
  })

  test('gdy usunięcie łamie integralność bazy (np. istniejące faktury), rzuca błąd i nie ukrywa go', async () => {
    const before = { id: 7 }
    const dbError = { message: 'violates foreign key constraint' }
    const selectBuilder = chain({ data: before, error: null })
    const deleteBuilder = chain({ data: null, error: dbError })
    fromMock.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(deleteBuilder)

    await expect(deleteContract(7)).rejects.toEqual(dbError)
  })
})

describe('revaluateContract', () => {
  test('przelicza czynsz o podany procent inflacji i zapisuje nową kwotę', async () => {
    const before = { id: 3, rent_amount: 1000 }
    const after = { id: 3, rent_amount: 1100 }
    const selectBuilder = chain({ data: before, error: null })
    const updateBuilder = chain({ data: after, error: null })
    fromMock.mockReturnValueOnce(selectBuilder).mockReturnValueOnce(updateBuilder)

    const newRent = await revaluateContract(3, 10)

    expect(newRent).toBe(1100)
    expect(updateBuilder.update).toHaveBeenCalledWith({ rent_amount: 1100 })
  })

  test('rzuca wyjątek gdy nie uda się pobrać umowy przed rewaluacją', async () => {
    const fetchError = new Error('not found')
    const selectBuilder = chain({ data: null, error: fetchError })
    fromMock.mockReturnValueOnce(selectBuilder)

    await expect(revaluateContract(999, 10)).rejects.toThrow('not found')
  })
})

describe('getContractStats', () => {
  test('sumuje kwoty faktur czynszowych za dany miesiąc/rok', async () => {
    // count zapytanie zwraca {count, error} zamiast {data, error} - osobny obiekt
    const countChain = chain({ count: 4, error: null })
    const invoicesChain = chain({ data: [{ amount: '1000' }, { amount: '1500.50' }], error: null })
    fromMock.mockReturnValueOnce(countChain).mockReturnValueOnce(invoicesChain)

    const stats = await getContractStats(9, 2026)

    expect(stats.activeContracts).toBe(4)
    expect(stats.rentCount).toBe(2)
    expect(stats.rentSum).toBeCloseTo(2500.5)
  })

  test('zwraca zera zamiast NaN/undefined gdy brak faktur w danym miesiącu', async () => {
    const countChain = chain({ count: 0, error: null })
    const invoicesChain = chain({ data: [], error: null })
    fromMock.mockReturnValueOnce(countChain).mockReturnValueOnce(invoicesChain)

    const stats = await getContractStats(1, 2026)

    expect(stats).toEqual({ activeContracts: 0, rentSum: 0, rentCount: 0 })
  })
})
