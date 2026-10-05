import { describe, test, expect, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './helpers/fakeSupabase'

let db: FakeSupabase
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db }))

const { getStatement } = await import('@/lib/statement')

const invoice = (id: number, month: number, amount: number, extra: Record<string, unknown> = {}) => ({
  id, tenant_id: 1, type: 'RENT', number: null, year: 2026, month, amount, ...extra,
})
const transaction = (id: number, date: string, amount: number, status = 'MATCHED', extra: Record<string, unknown> = {}) => ({
  id, tenant_id: 1, date, amount, status, title: null, description: null, category: 'RENT', ...extra,
})

describe('getStatement', () => {
  test('łączy rachunki i wpłaty chronologicznie z bieżącym saldem', async () => {
    db = createFakeSupabase({
      invoices: [invoice(1, 1, 1000), invoice(2, 2, 1000)],
      transactions: [transaction(1, '2026-01-10', 1000), transaction(2, '2026-02-05', 400)],
    })

    const entries = await getStatement(1)

    // 01-01 rachunek, 01-10 wpłata, 02-01 rachunek, 02-05 wpłata
    expect(entries.map((e) => e.id)).toEqual(['inv-1', 'tx-1', 'inv-2', 'tx-2'])
    expect(entries.map((e) => e.runningBalance)).toEqual([-1000, 0, -1000, -600])
  })

  test('rachunek ma kwotę ujemną i datę pierwszego dnia miesiąca', async () => {
    db = createFakeSupabase({ invoices: [invoice(1, 3, 1200)], transactions: [] })
    const [entry] = await getStatement(1)
    expect(entry).toMatchObject({ id: 'inv-1', date: '2026-03-01', amount: -1200, type: 'invoice', invoiceType: 'RENT' })
  })

  test('opis: czynsz vs media, numer tylko gdy zawiera "/"', async () => {
    db = createFakeSupabase({
      invoices: [
        invoice(1, 1, 100),
        invoice(2, 2, 100, { type: 'MEDIA' }),
        invoice(3, 3, 100, { number: 'FV/12/2026' }),
        invoice(4, 4, 100, { number: 'bez-ukosnika' }),
      ],
      transactions: [],
    })
    const entries = await getStatement(1)
    expect(entries.map((e) => e.description)).toEqual([
      'Obciążenie - Czynsz',
      'Obciążenie - Media',
      'Obciążenie - Czynsz (FV/12/2026)',
      'Obciążenie - Czynsz',
    ])
  })

  test('pomija odrzucone i nieprzypisane transakcje', async () => {
    db = createFakeSupabase({
      invoices: [],
      transactions: [
        transaction(1, '2026-01-10', 100, 'MATCHED'),
        transaction(2, '2026-01-11', 100, 'MANUAL'),
        transaction(3, '2026-01-12', 100, 'REJECTED_DUPLICATE'),
        transaction(4, '2026-01-13', 100, 'REJECTED_OWN_TRANSFER'),
        transaction(5, '2026-01-14', 100, 'UNMATCHED'),
      ],
    })
    const entries = await getStatement(1)
    expect(entries.map((e) => e.id)).toEqual(['tx-1', 'tx-2'])
  })

  test('nie zawiera danych innych najemców', async () => {
    db = createFakeSupabase({
      invoices: [invoice(1, 1, 100), { ...invoice(2, 1, 999), tenant_id: 2 }],
      transactions: [{ ...transaction(1, '2026-01-10', 500), tenant_id: 2 }],
    })
    const entries = await getStatement(1)
    expect(entries.map((e) => e.id)).toEqual(['inv-1'])
  })

  test('opis wpłaty: title > description > "Wpłata"', async () => {
    db = createFakeSupabase({
      invoices: [],
      transactions: [
        transaction(1, '2026-01-01', 10, 'MATCHED', { title: 'Tytuł', description: 'Opis' }),
        transaction(2, '2026-01-02', 10, 'MATCHED', { description: 'Opis' }),
        transaction(3, '2026-01-03', 10),
      ],
    })
    const entries = await getStatement(1)
    expect(entries.map((e) => e.description)).toEqual(['Tytuł', 'Opis', 'Wpłata'])
  })

  test('oznacza wpłaty z korektami (transaction_amendments)', async () => {
    db = createFakeSupabase({
      invoices: [],
      transactions: [transaction(1, '2026-01-01', 10), transaction(2, '2026-01-02', 10)],
      transaction_amendments: [{ transaction_id: 2 }],
    })
    const entries = await getStatement(1)
    expect(entries.map((e) => e.hasAmendments)).toEqual([false, true])
  })

  describe('isPaid (model skarbonki)', () => {
    // Uwaga: pula środków jest liczona chronologicznie - wpłata pokrywa tylko
    // rachunki datowane PO niej (rachunki są datowane 1. dnia miesiąca, więc
    // wpłata z 5. dnia nie oznacza jako opłaconego rachunku z 1. dnia tego
    // samego miesiąca). Test dokumentuje obecne zachowanie; `isPaid` nie jest
    // dziś nigdzie w UI wyświetlane (tylko saldo bieżące).
    test('wpłata pokrywa rachunki datowane po niej, kolejne zostają nieopłacone', async () => {
      db = createFakeSupabase({
        invoices: [invoice(1, 2, 1000), invoice(2, 3, 1000)],
        transactions: [transaction(1, '2026-01-05', 1500)],
      })
      const entries = await getStatement(1)
      const paid = Object.fromEntries(entries.map((e) => [e.id, e.isPaid]))
      expect(paid).toEqual({ 'tx-1': true, 'inv-1': true, 'inv-2': false })
    })

    test('rachunek przed jakąkolwiek wpłatą jest nieopłacony', async () => {
      db = createFakeSupabase({
        invoices: [invoice(1, 1, 1000)],
        transactions: [transaction(1, '2026-02-05', 1000)],
      })
      const entries = await getStatement(1)
      expect(entries.find((e) => e.id === 'inv-1')?.isPaid).toBe(false)
    })

    test('nadwyżka z jednej wpłaty pokrywa następne rachunki', async () => {
      db = createFakeSupabase({
        invoices: [invoice(1, 2, 500), invoice(2, 3, 500)],
        transactions: [transaction(1, '2026-01-05', 1000)],
      })
      const entries = await getStatement(1)
      expect(entries.filter((e) => e.type === 'invoice').map((e) => e.isPaid)).toEqual([true, true])
    })
  })
})
