import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { applyAppConfig, patchAppConfigForSuite } from '../../tests-support/appConfig'
import { createTestDbClient, E2E_PREFIX, purgeAllTestData } from '../../tests-support/db'
import {
  createInvoice,
  createProperty,
  createTenant,
  createTransaction,
  testEmail,
} from '../../tests-support/factories'
import { formatAmount } from '@/lib/utils'
import { mailbox, scopeTable, storage } from './helpers/runtime'
import {
  getGlobalPaymentStats,
  getTenantsWithBalances,
  getTenantWithBalance,
  sendBulkStatements,
  sendStatementToTenant,
} from '@/app/(dashboard)/kontrola-platnosci/actions'

const db = createTestDbClient()
const ADMIN_EMAIL = `${E2E_PREFIX.toLowerCase()}admin@example.invalid`

afterAll(async () => {
  await purgeAllTestData(db)
})

// Wysyłka wyciągu bierze adres nadawcy z app_config.admin_email.
patchAppConfigForSuite({ admin_email: ADMIN_EMAIL })

async function balanceOf(tenantId: number) {
  return (await getTenantsWithBalances()).find((t) => t.id === tenantId)
}

describe('salda najemców (getTenantsWithBalances / getTenantWithBalance)', () => {
  test('czynsz 1000, wpłata 400 -> zaległość -600', async () => {
    const tenant = await createTenant(db)
    await createInvoice(db, { tenantId: tenant.id, amount: 1000 })
    await createTransaction(db, { tenantId: tenant.id, amount: 400 })

    const row = await balanceOf(tenant.id)
    expect(row).toMatchObject({ balance: -600, totalInflows: 400 })
    expect((await getTenantWithBalance(tenant.id))?.balance).toBe(-600)
  })

  test('nadpłata daje saldo dodatnie, a równe kwoty -> zero', async () => {
    const over = await createTenant(db)
    await createInvoice(db, { tenantId: over.id, amount: 500 })
    await createTransaction(db, { tenantId: over.id, amount: 800 })
    const even = await createTenant(db)
    await createInvoice(db, { tenantId: even.id, amount: 300, type: 'MEDIA' })
    await createTransaction(db, { tenantId: even.id, amount: 300 })

    expect((await balanceOf(over.id))?.balance).toBe(300)
    expect((await balanceOf(even.id))?.balance).toBe(0)
  })

  test('liczą się tylko MATCHED i MANUAL - odrzucone, pominięte i nieznane są wykluczone', async () => {
    const tenant = await createTenant(db)
    await createInvoice(db, { tenantId: tenant.id, amount: 100 })
    await createTransaction(db, { tenantId: tenant.id, amount: 50, status: 'MATCHED' })
    await createTransaction(db, { tenantId: tenant.id, amount: 25, status: 'MANUAL', type: 'ADJUSTMENT' })
    for (const status of ['REJECTED_OTHER', 'REJECTED_DUPLICATE', 'REJECTED_OWN_TRANSFER', 'SKIPPED', 'UNMATCHED']) {
      await createTransaction(db, { tenantId: tenant.id, amount: 1000, status })
    }

    expect((await balanceOf(tenant.id))?.balance).toBe(-25)
    expect((await getTenantWithBalance(tenant.id))?.balance).toBe(-25)
  })

  test('lista jest posortowana rosnąco po saldzie (najwięksi dłużnicy na górze)', async () => {
    const debtor = await createTenant(db)
    await createInvoice(db, { tenantId: debtor.id, amount: 900 })
    const creditor = await createTenant(db)
    await createTransaction(db, { tenantId: creditor.id, amount: 100 })
    const small = await createTenant(db)
    await createInvoice(db, { tenantId: small.id, amount: 10 })

    const ids = [debtor.id, creditor.id, small.id]
    const order = (await getTenantsWithBalances()).filter((t) => ids.includes(t.id)).map((t) => t.id)
    expect(order).toEqual([debtor.id, small.id, creditor.id])
  })

  test('najemca bez danych ma saldo 0, a nieistniejący id -> null', async () => {
    const tenant = await createTenant(db)
    expect((await balanceOf(tenant.id))?.balance).toBe(0)
    expect(await getTenantWithBalance(2_000_000_000)).toBeNull()
  })
})

describe('statystyki globalne (getGlobalPaymentStats)', () => {
  test('dodanie czynszu i wpłaty zmienia sumy o dokładnie te kwoty, a odrzucone nie wpływają', async () => {
    const before = await getGlobalPaymentStats()
    const tenant = await createTenant(db)
    await createInvoice(db, { tenantId: tenant.id, amount: 1000 })
    await createTransaction(db, { tenantId: tenant.id, amount: 400, date: '2001-01-01' })
    await createTransaction(db, { tenantId: null, amount: 999, status: 'REJECTED_OTHER', date: '2000-01-01' })

    const after = await getGlobalPaymentStats()

    expect(after.totalInvoiced - before.totalInvoiced).toBeCloseTo(1000)
    expect(after.totalInflows - before.totalInflows).toBeCloseTo(400)
    // Odrzucona transakcja z 2000 r. nie może przesunąć "śledzimy od".
    expect(new Date(after.trackingSince!).getTime()).toBeLessThanOrEqual(new Date('2001-01-01').getTime())
    expect(new Date(after.trackingSince!).getFullYear()).toBeGreaterThanOrEqual(2001)
  })
})

describe('sendStatementToTenant', () => {
  async function debtorWithEmail(emails: { email?: string | null; email2?: string | null }) {
    const property = await createProperty(db)
    const tenant = await createTenant(db, { propertyId: property.id, ...emails })
    await createInvoice(db, { tenantId: tenant.id, amount: 1000 })
    await createTransaction(db, { tenantId: tenant.id, amount: 400 })
    return { property, tenant }
  }

  test('wysyła wyciąg z PDF do obu adresów i zapisuje wpis w email_logs', async () => {
    const email = testEmail('glowny')
    const email2 = testEmail('drugi')
    const { property, tenant } = await debtorWithEmail({ email, email2 })

    const result = await sendStatementToTenant(tenant.id)

    expect(result).toEqual({ success: true })
    expect(mailbox.sent).toHaveLength(1)
    const [mail] = mailbox.sent
    expect(mail.from).toBe(ADMIN_EMAIL)
    expect(mail.to).toEqual([email, email2])
    expect(mail.subject.startsWith(`[PREVIEW] ${property.name} – Rozliczenie salda: `)).toBe(true)
    expect(mail.html).toContain(formatAmount(-600))
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].filename).toBe('Wyciag_z_konta.pdf')
    expect(mail.attachments[0].content.subarray(0, 4).toString()).toBe('%PDF')

    const { data: logs } = await db.from('email_logs').select('*').ilike('to_email', `%${email}%`)
    expect(logs).toHaveLength(1)
    expect(logs![0].to_email).toBe(`${email}, ${email2}`)
    expect(logs![0].subject).toBe(mail.subject)
    expect(logs![0].attachments).toEqual([expect.objectContaining({ name: 'Wyciag_z_konta.pdf' })])
    // Załącznik trafia do Storage pod prefiksem preview/ (kopia na potrzeby podglądu w wiadomościach).
    expect(storage.uploads).toHaveLength(1)
    expect(storage.uploads[0]).toMatchObject({ bucket: 'invoices', contentType: 'application/pdf' })
    expect(storage.uploads[0].path.startsWith('preview/emails/')).toBe(true)
  })

  test('najemca bez adresu e-mail -> błąd i brak wysyłki', async () => {
    const { tenant } = await debtorWithEmail({ email: null })

    const result = await sendStatementToTenant(tenant.id)

    expect(result).toEqual({ success: false, error: 'Najemca nie ma przypisanego adresu email' })
    expect(mailbox.sent).toHaveLength(0)
  })

  test('nieistniejący najemca -> błąd', async () => {
    expect(await sendStatementToTenant(2_000_000_000)).toEqual({ success: false, error: 'Nie znaleziono najemcy' })
  })

  test('awaria SMTP jest zwrócona jako błąd, a nie wyjątek, i nie zostawia wpisu w logach', async () => {
    const email = testEmail()
    const { tenant } = await debtorWithEmail({ email })
    mailbox.failWith = new Error('SMTP down')

    const result = await sendStatementToTenant(tenant.id)

    expect(result).toEqual({ success: false, error: 'SMTP down' })
    const { data: logs } = await db.from('email_logs').select('id').ilike('to_email', `%${email}%`)
    expect(logs).toHaveLength(0)
  })

  test('brak adresu administratora w ustawieniach -> czytelny błąd', async () => {
    const { tenant } = await debtorWithEmail({ email: testEmail() })
    const restore = await applyAppConfig(db, { admin_email: null })
    try {
      const result = await sendStatementToTenant(tenant.id)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Brak adresu administratora')
      expect(mailbox.sent).toHaveLength(0)
    } finally {
      await restore()
    }
  })
})

describe('sendBulkStatements', () => {
  // Wysyłka zbiorcza obejmuje WSZYSTKICH dłużników w bazie - zawężamy tabelę
  // tenants do danych testowych, żeby nie trafić w prawdziwych najemców.
  beforeEach(() => {
    scopeTable('tenants', (q) => q.like('last_name', `${E2E_PREFIX}%`))
  })

  test('wysyła tylko do dłużników z adresem e-mail i zwraca ich liczbę', async () => {
    const debtorMail = testEmail('dluznik')
    const debtor = await createTenant(db, { email: debtorMail })
    await createInvoice(db, { tenantId: debtor.id, amount: 300 })
    const debtorNoMail = await createTenant(db)
    await createInvoice(db, { tenantId: debtorNoMail.id, amount: 300 })
    const settledMail = testEmail('rozliczony')
    const settled = await createTenant(db, { email: settledMail })
    await createInvoice(db, { tenantId: settled.id, amount: 100 })
    await createTransaction(db, { tenantId: settled.id, amount: 100 })

    const result = await sendBulkStatements()

    expect(result).toEqual({ success: true, count: 1 })
    expect(mailbox.sent.map((m) => m.to)).toEqual([[debtorMail]])
    expect(mailbox.sent[0].html).toContain(formatAmount(-300))
  })

  test('bez dłużników nic nie wysyła', async () => {
    const creditor = await createTenant(db, { email: testEmail() })
    await createTransaction(db, { tenantId: creditor.id, amount: 50 })

    expect(await sendBulkStatements()).toEqual({ success: true, count: 0 })
    expect(mailbox.sent).toHaveLength(0)
  })
})
