import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { createTestDbClient, E2E_PREFIX, loose, purgeAllTestData } from '../../tests-support/db'
import { createTenant, createTransaction, fakeAccount, uniq } from '../../tests-support/factories'
import { patchAppConfigForSuite } from '../../tests-support/appConfig'
import { scopeTable } from './helpers/runtime'

// importBankStatement zapisuje kopię pliku do data/attachments (do czasu
// przeniesienia archiwum do Supabase Storage - testing-plan.md, Faza 3.1).
// Atrapa, żeby test nie śmiecił w katalogu projektu.
vi.mock('fs/promises', () => {
  const api = {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    readFile: vi.fn(async () => {
      throw new Error('ENOENT')
    }),
  }
  return { default: api, ...api }
})

const {
  importBankStatement,
  reconcileTransaction,
  reconcileMany,
  dismissTransaction,
  dismissAllTransactions,
  updateTransactionCategory,
  getImportHistoryList,
} = await import('@/app/(dashboard)/import/actions')
const { calculateBalance } = await import('@/lib/balance')

const db = createTestDbClient()
const ldb = loose(db)

afterAll(async () => {
  await purgeAllTestData(db)
})

// Akcje importu czytają całe tabele tenants / transaction_staging (a dismissAll
// nawet je kasuje) - zawężamy je do danych testowych, żeby nie ruszyć prawdziwych.
beforeEach(() => {
  scopeTable('tenants', (q) => q.like('last_name', `${E2E_PREFIX}%`))
  scopeTable('transaction_staging', (q) => q.like('title', `${E2E_PREFIX}%`))
})

type CsvRow = { date: string; title?: string; amount: string; account: string }

// Format PKO BP (rozpoznawany przez csvParser po nagłówkach).
function csv(rows: CsvRow[]) {
  return [
    'Data operacji;Opis transakcji;Kwota;Rachunek nadawcy/odbiorcy',
    ...rows.map((r) => [r.date, r.title ?? `${E2E_PREFIX}Przelew ${uniq()}`, r.amount, r.account].join(';')),
  ].join('\n')
}

const fileName = () => `${E2E_PREFIX}wyciag_${uniq()}.csv`

async function stagingFor(account: string) {
  const { data, error } = await ldb.from('transaction_staging').select('*').eq('bank_account', account)
  if (error) throw error
  return (data ?? []) as {
    id: number
    amount: number
    date: string
    title: string
    suggested_tenant_id: number | null
    is_duplicate: boolean
    import_id: number
    raw_data: Record<string, unknown> | null
  }[]
}

async function transactionsFor(account: string) {
  const { data, error } = await ldb.from('transactions').select('*').eq('bank_account', account)
  if (error) throw error
  return (data ?? []) as {
    id: number
    amount: number
    status: string
    type: string
    tenant_id: number | null
    category: string | null
    description: string | null
    import_id: number | null
  }[]
}

describe('importBankStatement - dopasowanie najemcy', () => {
  test('znane konto najemcy -> wiersz w kolejce z suggested_tenant_id', async () => {
    const account = fakeAccount()
    const tenant = await createTenant(db, { accounts: [account] })

    const summary = await importBankStatement(csv([{ date: '2001-03-05', amount: '1 234,56', account }]), fileName())

    expect(summary.bank).toBe('PKO BP')
    expect(summary).toMatchObject({ total: 1, withSuggestion: 1, withoutSuggestion: 0, duplicates: 0 })
    const [row] = await stagingFor(account)
    expect(row.suggested_tenant_id).toBe(tenant.id)
    expect(Number(row.amount)).toBe(1234.56)
    expect(row.is_duplicate).toBe(false)
    expect(row.raw_data?._auto_reject).toBeUndefined()
  })

  test('nieznane konto -> brak sugestii', async () => {
    const account = fakeAccount()
    await createTenant(db, { accounts: [fakeAccount()] })

    const summary = await importBankStatement(csv([{ date: '2001-03-05', amount: '100,00', account }]), fileName())

    expect(summary).toMatchObject({ total: 1, withSuggestion: 0, withoutSuggestion: 1 })
    const [row] = await stagingFor(account)
    expect(row.suggested_tenant_id).toBeNull()
  })

  test('spacje w numerze rachunku i prefiks PL nie przeszkadzają w dopasowaniu', async () => {
    const digits = fakeAccount().slice(2)
    const tenant = await createTenant(db, { accounts: [digits] }) // zapisany bez PL
    const spaced = `PL${digits.replace(/(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4 $5 $6 $7')}`

    await importBankStatement(csv([{ date: '2001-03-06', amount: '50,00', account: spaced }]), fileName())

    const [row] = await stagingFor(spaced)
    expect(row.suggested_tenant_id).toBe(tenant.id)
  })
})

describe('importBankStatement - auto-odrzucanie', () => {
  test('kwota <= 0 (przelew wychodzący) -> flaga _auto_reject i brak sugestii', async () => {
    const account = fakeAccount()
    await createTenant(db, { accounts: [account] })

    await importBankStatement(csv([{ date: '2001-03-05', amount: '-200,00', account }]), fileName())

    const [row] = await stagingFor(account)
    expect(row.raw_data?._auto_reject).toBe(true)
    expect(row.suggested_tenant_id).toBeNull()
  })

  test('duplikat już zaksięgowanej transakcji -> is_duplicate i _auto_reject (powód: duplicate)', async () => {
    const account = fakeAccount()
    const tenant = await createTenant(db, { accounts: [account] })
    await createTransaction(db, { tenantId: tenant.id, amount: 700, date: '2001-03-07', bankAccount: account, status: 'MATCHED' })

    const summary = await importBankStatement(csv([{ date: '2001-03-07', amount: '700,00', account }]), fileName())

    expect(summary.duplicates).toBe(1)
    const [row] = await stagingFor(account)
    expect(row.is_duplicate).toBe(true)
    expect(row.raw_data).toMatchObject({ _auto_reject: true, _auto_reject_reason: 'duplicate' })
    expect(row.suggested_tenant_id).toBeNull()
  })

  describe('konto z ignored_source_accounts', () => {
    const ownAccount = fakeAccount()
    patchAppConfigForSuite({ ignored_source_accounts: ownAccount })

    test('wiersz w kolejce jest auto-odrzucony mimo że najemca ma to konto', async () => {
      await createTenant(db, { accounts: [ownAccount] })

      await importBankStatement(csv([{ date: '2001-03-05', amount: '300,00', account: ownAccount }]), fileName())

      const [row] = await stagingFor(ownAccount)
      expect(row.raw_data?._auto_reject).toBe(true)
      expect(row.suggested_tenant_id).toBeNull()
    })

    test('pominięty wiersz (nieparsowalna kwota) z własnego konta trafia jako REJECTED_OWN_TRANSFER', async () => {
      await importBankStatement(csv([{ date: '2001-03-08', amount: 'abc', account: ownAccount }]), fileName())

      const txs = await transactionsFor(ownAccount)
      expect(txs).toHaveLength(1)
      expect(txs[0].status).toBe('REJECTED_OWN_TRANSFER')
      expect(txs[0].tenant_id).toBeNull()
    })
  })

  test('pominięty wiersz z nieznanego konta trafia jako SKIPPED', async () => {
    const account = fakeAccount()

    const summary = await importBankStatement(csv([{ date: '2001-03-08', amount: 'abc', account }]), fileName())

    expect(summary.skipped).toBeGreaterThanOrEqual(1)
    const txs = await transactionsFor(account)
    expect(txs.map((t) => t.status)).toEqual(['SKIPPED'])
  })
})

describe('importBankStatement - ponowny import i zakres dni', () => {
  test('ponowny import tego samego pliku nie dubluje wierszy w kolejce', async () => {
    const account = fakeAccount()
    const content = csv([{ date: '2001-03-05', title: `${E2E_PREFIX}Czynsz`, amount: '900,00', account }])

    const first = await importBankStatement(content, fileName())
    const second = await importBankStatement(content, fileName())

    expect(first.total).toBe(1)
    expect(second.skipped).toBe(1)
    expect(second.withSuggestion + second.withoutSuggestion).toBe(0)
    expect(await stagingFor(account)).toHaveLength(1)
  })

  test('dayFrom/dayTo przycinają zakres dni, a podsumowanie trafia do audit_log.after_data', async () => {
    const account = fakeAccount()
    const content = csv([
      { date: '2001-04-05', amount: '10,00', account },
      { date: '2001-04-15', amount: '20,00', account },
      { date: '2001-04-25', amount: '30,00', account },
    ])

    const summary = await importBankStatement(content, `${E2E_PREFIX}zakres.csv`, 10, 20, 0)

    expect(summary).toMatchObject({ total: 1, skipped: 2, minDate: '2001-04-15', maxDate: '2001-04-15', dayFrom: 10, dayTo: 20, docSlot: 0 })
    const rows = await stagingFor(account)
    expect(rows.map((r) => r.date)).toEqual(['2001-04-15'])

    const { data: audit } = await db.from('audit_log').select('action_name, after_data').eq('id', rows[0].import_id).single()
    expect(audit?.action_name).toBe('importBankStatement')
    const { lateReminders, ...persisted } = summary
    expect(lateReminders).toBeNull()
    expect(audit?.after_data).toEqual(persisted)
  })
})

describe('akceptacja i odrzucanie wierszy z kolejki', () => {
  async function stageOne(amount = '400,00') {
    const account = fakeAccount()
    const tenant = await createTenant(db, { accounts: [account] })
    await importBankStatement(csv([{ date: '2001-05-05', amount, account }]), fileName())
    const [row] = await stagingFor(account)
    return { account, tenant, row }
  }

  test('reconcileTransaction przenosi wiersz do transactions jako MATCHED i zmienia saldo najemcy', async () => {
    const { account, tenant, row } = await stageOne('400,00')
    expect(await calculateBalance(tenant.id)).toBe(0)

    await reconcileTransaction(row.id, tenant.id, false, 'RENT')

    expect(await stagingFor(account)).toHaveLength(0)
    const [tx] = await transactionsFor(account)
    expect(tx).toMatchObject({ status: 'MATCHED', type: 'BANK', tenant_id: tenant.id, category: 'RENT', import_id: row.import_id })
    expect(Number(tx.amount)).toBe(400)
    expect(await calculateBalance(tenant.id)).toBe(400)
  })

  test('saveAccount dopisuje nowy rachunek do najemcy (bez dubli przy ponownym zapisie)', async () => {
    const account = fakeAccount()
    const knownAccount = fakeAccount()
    const tenant = await createTenant(db, { accounts: [knownAccount] })
    await importBankStatement(csv([{ date: '2001-05-06', amount: '80,00', account }]), fileName())
    const [row] = await stagingFor(account)

    await reconcileTransaction(row.id, tenant.id, true)

    const { data } = await db.from('tenants').select('bank_accounts_as_text').eq('id', tenant.id).single()
    expect(data?.bank_accounts_as_text.split('\n')).toEqual([knownAccount, account])
  })

  test('reconcileMany zatwierdza kilka wierszy naraz', async () => {
    const a = await stageOne('100,00')
    const b = await stageOne('250,50')

    await reconcileMany([
      { txId: a.row.id, tenantId: a.tenant.id, category: 'RENT' },
      { txId: b.row.id, tenantId: b.tenant.id, category: 'MEDIA' },
    ])

    expect(await calculateBalance(a.tenant.id)).toBe(100)
    expect(await calculateBalance(b.tenant.id)).toBe(250.5)
    expect((await transactionsFor(b.account))[0].category).toBe('MEDIA')
  })

  test('dismissTransaction odrzuca wiersz: status REJECTED_*, saldo bez zmian', async () => {
    const { account, tenant, row } = await stageOne('500,00')

    await dismissTransaction(row.id, 'REJECTED_DUPLICATE', '  to duplikat  ')

    expect(await stagingFor(account)).toHaveLength(0)
    const [tx] = await transactionsFor(account)
    expect(tx).toMatchObject({ status: 'REJECTED_DUPLICATE', tenant_id: null, description: 'to duplikat', import_id: row.import_id })
    expect(await calculateBalance(tenant.id)).toBe(0)
  })

  test('dismissAllTransactions odrzuca całą kolejkę testową jako REJECTED_OTHER', async () => {
    const a = await stageOne('11,00')
    const b = await stageOne('12,00')

    await dismissAllTransactions()

    for (const { account } of [a, b]) {
      expect(await stagingFor(account)).toHaveLength(0)
      expect((await transactionsFor(account)).map((t) => t.status)).toEqual(['REJECTED_OTHER'])
    }
  })

  test('updateTransactionCategory zmienia kategorię zaksięgowanej transakcji', async () => {
    const { account, tenant, row } = await stageOne('60,00')
    await reconcileTransaction(row.id, tenant.id, false, 'RENT')
    const [tx] = await transactionsFor(account)

    await updateTransactionCategory(tx.id, 'MEDIA')

    expect((await transactionsFor(account))[0].category).toBe('MEDIA')
  })

  test('historia importów pokazuje żywy status: do zatwierdzenia / zatwierdzone / odrzucone', async () => {
    const tenant = await createTenant(db, { accounts: [] })
    const accounts = [fakeAccount(), fakeAccount(), fakeAccount()]
    await importBankStatement(
      csv(accounts.map((account, i) => ({ date: '2001-05-10', amount: `${i + 1}0,00`, account }))),
      fileName(),
    )
    const rows = await Promise.all(accounts.map(async (a) => (await stagingFor(a))[0]))
    const importId = rows[0].import_id

    await reconcileTransaction(rows[0].id, tenant.id, false, 'RENT')
    await dismissTransaction(rows[1].id)

    const entry = (await getImportHistoryList()).find((h) => h.id === importId)
    expect(entry).toMatchObject({ pendingCount: 1, acceptedCount: 1, rejectedCount: 1 })
  })
})
