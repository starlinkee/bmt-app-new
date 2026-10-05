import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './helpers/fakeSupabase'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const logAuditMock = vi.fn()
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAuditMock(...args) }))

let db: FakeSupabase
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db }))

const { getRentPreview, generateRents } = await import('@/lib/rents')

const tenant = (id: number, extra: Record<string, unknown> = {}) => ({
  id, first_name: `Jan${id}`, last_name: 'Kowalski', tenant_type: 'PRIVATE', company_name: null, email: `t${id}@example.com`,
  ...extra,
})
const contract = (id: number, t: ReturnType<typeof tenant>, extra: Record<string, unknown> = {}) => ({
  id, tenant_id: t.id, is_active: true, rent_amount: 1000, end_date: null, tenants: t, ...extra,
})

function seed(contracts: unknown[], invoices: unknown[] = []) {
  db = createFakeSupabase(
    {
      contracts: contracts as never[],
      invoices: invoices as never[],
      app_config: [{ id: 1, admin_email: 'admin@example.com' }],
    },
    { unique: { invoices: ['contract_id', 'type', 'month', 'year'] } },
  )
}

beforeEach(() => {
  logAuditMock.mockReset()
})

describe('getRentPreview', () => {
  test('dzieli aktywne umowy na mające i nie mające e-maila', async () => {
    seed([
      contract(1, tenant(1)),
      contract(2, tenant(2, { email: null })),
    ])

    const preview = await getRentPreview(6, 2026)

    expect(preview.withEmail.map((c) => c.id)).toEqual([1])
    expect(preview.withoutEmail.map((c) => c.id)).toEqual([2])
    expect(preview.senderEmail).toBe('admin@example.com')
    expect(preview.skippedCount).toBe(0)
  })

  test('pomija nieaktywne umowy', async () => {
    seed([contract(1, tenant(1), { is_active: false }), contract(2, tenant(2))])
    const { withEmail, withoutEmail } = await getRentPreview(6, 2026)
    expect([...withEmail, ...withoutEmail].map((c) => c.id)).toEqual([2])
  })

  test('umowa zakończona przed danym miesiącem jest pomijana, w miesiącu zakończenia nadal naliczana', async () => {
    seed([
      contract(1, tenant(1), { end_date: '2026-05-31' }),
      contract(2, tenant(2), { end_date: '2026-06-30' }),
      contract(3, tenant(3), { end_date: '2026-07-31' }),
    ])
    const { withEmail } = await getRentPreview(6, 2026)
    expect(withEmail.map((c) => c.id)).toEqual([2, 3])
  })

  test('pomija umowy z już istniejącym rachunkiem RENT za ten miesiąc i liczy je w skippedCount', async () => {
    seed(
      [contract(1, tenant(1)), contract(2, tenant(2))],
      [{ type: 'RENT', month: 6, year: 2026, contract_id: 1, tenant_id: 1, amount: 1000 }],
    )
    const preview = await getRentPreview(6, 2026)
    expect(preview.withEmail.map((c) => c.id)).toEqual([2])
    expect(preview.skippedCount).toBe(1)
  })

  test('rachunek z innego miesiąca nie blokuje naliczenia', async () => {
    seed(
      [contract(1, tenant(1))],
      [{ type: 'RENT', month: 5, year: 2026, contract_id: 1, tenant_id: 1, amount: 1000 }],
    )
    const preview = await getRentPreview(6, 2026)
    expect(preview.withEmail.map((c) => c.id)).toEqual([1])
    expect(preview.skippedCount).toBe(0)
  })
})

describe('generateRents', () => {
  test('tworzy tylko rekord rachunku RENT z number: null (bez PDF i e-maila)', async () => {
    seed([contract(1, tenant(1, { email: 't1@example.com' }), { rent_amount: 1234.5 })])

    const { results, skippedCount } = await generateRents(6, 2026, 'CRON')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ invoiceNumber: null })
    expect(results[0].emailError).toBeUndefined()
    expect(skippedCount).toBe(0)
    expect(db.tables.invoices).toHaveLength(1)
    expect(db.tables.invoices[0]).toMatchObject({
      type: 'RENT',
      number: null,
      amount: 1234.5,
      month: 6,
      year: 2026,
      tenant_id: 1,
      contract_id: 1,
      source: 'CRON',
    })
  })

  test('ponowne uruchomienie za ten sam miesiąc nie dubluje rachunków', async () => {
    seed([contract(1, tenant(1)), contract(2, tenant(2))])

    await generateRents(6, 2026)
    const second = await generateRents(6, 2026)

    expect(db.tables.invoices).toHaveLength(2)
    expect(second.results).toHaveLength(0)
    expect(second.skippedCount).toBe(2)
  })

  test.each(['CRON', 'MANUAL', 'TEST_MANUAL'] as const)('zapisuje źródło %s', async (source) => {
    seed([contract(1, tenant(1))])
    await generateRents(6, 2026, source)
    expect(db.tables.invoices[0].source).toBe(source)
  })

  test('domyślne źródło to MANUAL', async () => {
    seed([contract(1, tenant(1))])
    await generateRents(6, 2026)
    expect(db.tables.invoices[0].source).toBe('MANUAL')
  })

  test('uwzględnia też najemców bez e-maila', async () => {
    seed([contract(1, tenant(1, { email: null }))])
    const { results } = await generateRents(6, 2026)
    expect(results).toHaveLength(1)
    expect(db.tables.invoices).toHaveLength(1)
  })

  test('nazwa najemcy: firma dla BUSINESS, imię i nazwisko dla osoby', async () => {
    seed([
      contract(1, tenant(1)),
      contract(2, tenant(2, { tenant_type: 'BUSINESS', company_name: 'Acme Sp. z o.o.' })),
    ])
    const { results } = await generateRents(6, 2026)
    expect(results.map((r) => r.tenantName).sort()).toEqual(['Acme Sp. z o.o.', 'Jan1 Kowalski'])
  })

  test('zapisuje wpis audytu z liczbą wygenerowanych i pominiętych', async () => {
    seed(
      [contract(1, tenant(1)), contract(2, tenant(2))],
      [{ type: 'RENT', month: 6, year: 2026, contract_id: 1, tenant_id: 1, amount: 1000 }],
    )
    await generateRents(6, 2026, 'CRON')
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: 'generateRents',
        tableName: 'invoices',
        afterData: expect.objectContaining({ month: 6, year: 2026, source: 'CRON', count: 1, skippedCount: 1 }),
      }),
    )
  })
})
