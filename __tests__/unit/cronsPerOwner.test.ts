import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './helpers/fakeSupabase'

// Crony działają service rolą (bez sesji), więc izolację kont pilnuje kod: każde zapytanie
// zawężone do owner_id, każdy zapis z jawnym owner_id (fake rzuca przy zapisie bez właściciela).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const logAuditMock = vi.fn()
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAuditMock(...args) }))

let db: FakeSupabase
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db }))

let now: Date
vi.mock('@/lib/clock', () => ({ getCurrentDate: async () => now }))

const getTenantsWithBalancesMock = vi.fn()
const sendStatementToTenantMock = vi.fn()
vi.mock('@/app/(dashboard)/kontrola-platnosci/actions', () => ({
  getTenantsWithBalances: (...a: unknown[]) => getTenantsWithBalancesMock(...a),
  sendStatementToTenant: (...a: unknown[]) => sendStatementToTenantMock(...a),
}))

const sendStatementUploadReminderEmailMock = vi.fn()
const sendMeterReadingReminderEmailMock = vi.fn()
vi.mock('@/lib/email', () => ({
  sendStatementUploadReminderEmail: (...a: unknown[]) => sendStatementUploadReminderEmailMock(...a),
  sendMeterReadingReminderEmail: (...a: unknown[]) => sendMeterReadingReminderEmailMock(...a),
}))

const { getRentPreview, generateRents } = await import('@/lib/rents')
const { processStatementUploadReminder } = await import('@/lib/statement-reminder')
const { processMeterReadingReminder, getEligibleMeterReminderTenants } = await import('@/lib/meter-reading-reminder')
const { processLateReminders } = await import('@/lib/late-reminders')
const { runForEachOwner, allOwnersFailed } = await import('@/lib/cron-owners')

const DEDUP_UNIQUE = { reminder_dedup: ['owner_id', 'action_name', 'dedup_key'] }

const tenant = (id: number, owner: string, extra: Record<string, unknown> = {}) => ({
  owner_id: owner, id, first_name: `Jan${id}`, last_name: 'K', email: `t${id}@example.com`, email2: null, property_id: 10 + id,
  reading_token: `tok${id}`, tenant_type: 'PRIVATE', company_name: null, contracts: [{ is_active: true, has_media_invoice: true }], ...extra,
})
const contract = (id: number, owner: string, t: ReturnType<typeof tenant>, rent = 1000) => ({
  id, owner_id: owner, tenant_id: t.id, is_active: true, rent_amount: rent, end_date: null, tenants: t,
})

function seed(initial: Record<string, unknown[]>) {
  db = createFakeSupabase(
    { reminder_dedup: [], invoices: [], ...initial } as never,
    { unique: { ...DEDUP_UNIQUE, invoices: ['owner_id', 'contract_id', 'type', 'month', 'year'] } },
  )
}

beforeEach(() => {
  logAuditMock.mockReset()
  getTenantsWithBalancesMock.mockReset()
  sendStatementToTenantMock.mockReset()
  sendStatementUploadReminderEmailMock.mockReset()
  sendMeterReadingReminderEmailMock.mockReset()
})

describe('strażnik zapisów service rolą', () => {
  test('insert/upsert do tabeli z owner_id bez owner_id rzuca', async () => {
    seed({})
    await expect(Promise.resolve(db.from('reminder_dedup').insert({ action_name: 'x', dedup_key: 'y' }))).rejects.toThrow(/bez owner_id/)
    await expect(Promise.resolve(db.from('invoices').upsert([{ owner_id: 'o1', amount: 1 }, { amount: 2 }]))).rejects.toThrow(/bez owner_id/)
  })

  test('z owner_id przechodzi, a tabele globalne (system_settings) są wyjątkiem', async () => {
    seed({})
    await expect(Promise.resolve(db.from('reminder_dedup').insert({ owner_id: 'o1', action_name: 'x', dedup_key: 'y' }))).resolves.toMatchObject({ error: null })
    await expect(Promise.resolve(db.from('system_settings').insert({ id: 1 }))).resolves.toMatchObject({ error: null })
  })
})

describe('czynsze na 2 kontach', () => {
  const t1 = tenant(1, 'o1')
  const t2 = tenant(2, 'o2')
  const data = () => ({
    contracts: [contract(1, 'o1', t1, 1000), contract(2, 'o2', t2, 2000)],
    app_config: [
      { owner_id: 'o1', admin_email: 'a1@example.com' },
      { owner_id: 'o2', admin_email: 'a2@example.com' },
    ],
  })

  test('podgląd konta o2 nie zawiera umów o1 (i odwrotnie), nadawca z konfiguracji konta', async () => {
    seed(data())
    const p2 = await getRentPreview('o2', 6, 2026)
    expect(p2.withEmail.map((c) => c.id)).toEqual([2])
    expect(p2.senderEmail).toBe('a2@example.com')
    const p1 = await getRentPreview('o1', 6, 2026)
    expect(p1.withEmail.map((c) => c.id)).toEqual([1])
  })

  test('generateRents(o1) tworzy rachunki tylko o1 z jego owner_id i audytem tego konta', async () => {
    seed(data())
    await generateRents('o1', 6, 2026, 'CRON')
    expect(db.tables.invoices).toEqual([expect.objectContaining({ owner_id: 'o1', contract_id: 1, amount: 1000 })])
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'o1', actionName: 'generateRents' }))
  })

  test('rachunek o1 za ten miesiąc nie liczy się do pominiętych o2', async () => {
    seed({ ...data(), invoices: [{ owner_id: 'o1', type: 'RENT', month: 6, year: 2026, contract_id: 1, tenant_id: 1, amount: 1000 }] })
    const p2 = await getRentPreview('o2', 6, 2026)
    expect(p2.skippedCount).toBe(0)
    expect(p2.withEmail.map((c) => c.id)).toEqual([2])
  })

  test('pętla po kontach: oba konta dostają własne rachunki', async () => {
    seed(data())
    await generateRents('o1', 6, 2026)
    await generateRents('o2', 6, 2026)
    expect(db.tables.invoices.map((i) => [i.owner_id, i.contract_id])).toEqual([['o1', 1], ['o2', 2]])
  })
})

describe('przypomnienie o wyciągu na 2 kontach', () => {
  const cfg = () => ({
    app_config: [
      { owner_id: 'o1', admin_email: 'a1@example.com', statement_upload_reminder_subject: 'S1', statement_upload_reminder_body: 'B1' },
      { owner_id: 'o2', admin_email: 'a2@example.com', statement_upload_reminder_subject: 'S2', statement_upload_reminder_body: 'B2' },
    ],
  })

  test('każde konto dostaje swoje przypomnienie, dedup jest per konto', async () => {
    now = new Date(2026, 5, 16)
    seed(cfg())

    expect(await processStatementUploadReminder('o1')).toEqual({ sent: true })
    expect(await processStatementUploadReminder('o2')).toEqual({ sent: true })
    expect(sendStatementUploadReminderEmailMock).toHaveBeenNthCalledWith(1, 'o1', 'a1@example.com', 'S1', 'B1')
    expect(sendStatementUploadReminderEmailMock).toHaveBeenNthCalledWith(2, 'o2', 'a2@example.com', 'S2', 'B2')
    expect(db.tables.reminder_dedup.map((r) => r.owner_id)).toEqual(['o1', 'o2'])

    expect(await processStatementUploadReminder('o1')).toEqual({ sent: false, reason: 'Already sent this month' })
    expect(sendStatementUploadReminderEmailMock).toHaveBeenCalledTimes(2)
  })

  test('błąd wysyłki o1 zwalnia tylko zastrzeżenie o1 (o2 zostaje)', async () => {
    now = new Date(2026, 5, 16)
    seed(cfg())
    await processStatementUploadReminder('o2')
    sendStatementUploadReminderEmailMock.mockRejectedValueOnce(new Error('SMTP down'))

    await expect(processStatementUploadReminder('o1')).rejects.toThrow('SMTP down')

    expect(db.tables.reminder_dedup.map((r) => r.owner_id)).toEqual(['o2'])
  })

  test('konto bez adresu admina nie blokuje przypomnienia innego konta', async () => {
    now = new Date(2026, 5, 16)
    seed({ app_config: [{ owner_id: 'o1', admin_email: null }, cfg().app_config[1]] })
    expect((await processStatementUploadReminder('o1')).sent).toBe(false)
    expect(await processStatementUploadReminder('o2')).toEqual({ sent: true })
  })
})

describe('przypomnienie o odczytach na 2 kontach', () => {
  const data = () => ({
    tenants: [tenant(1, 'o1'), tenant(2, 'o2')],
    settlement_group_properties: [
      { owner_id: 'o1', property_id: 11, settlement_group_id: 100 },
      { owner_id: 'o2', property_id: 12, settlement_group_id: 200 },
    ],
    settlement_groups: [
      { owner_id: 'o1', id: 100, tenant_reading_keys: { '1': ['woda'] } },
      { owner_id: 'o2', id: 200, tenant_reading_keys: { '2': ['woda'] } },
    ],
    app_config: [
      { owner_id: 'o1', meter_reading_reminder_subject: 'T1', meter_reading_reminder_body: 'B1' },
      { owner_id: 'o2', meter_reading_reminder_subject: 'T2', meter_reading_reminder_body: 'B2' },
    ],
  })

  test('lista odbiorców to tylko najemcy danego konta', async () => {
    seed(data())
    expect((await getEligibleMeterReminderTenants('o1')).map((t) => t.id)).toEqual([1])
    expect((await getEligibleMeterReminderTenants('o2')).map((t) => t.id)).toEqual([2])
  })

  test('wysyłka o1 nie dotyka najemców o2; dedup per konto', async () => {
    now = new Date(2026, 5, 30)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    seed(data())

    await processMeterReadingReminder('o1')
    expect(sendMeterReadingReminderEmailMock).toHaveBeenCalledTimes(1)
    expect(sendMeterReadingReminderEmailMock).toHaveBeenCalledWith('o1', ['t1@example.com'], 'Jan1 K', 'https://app.example.com/odczyty/tok1', 'T1', 'B1')

    // o2 w tym samym miesiącu nadal może dostać swoje przypomnienie.
    expect(await processMeterReadingReminder('o2')).toMatchObject({ sent: true, count: 1 })
    expect(sendMeterReadingReminderEmailMock).toHaveBeenLastCalledWith('o2', ['t2@example.com'], 'Jan2 K', 'https://app.example.com/odczyty/tok2', 'T2', 'B2')

    expect(await processMeterReadingReminder('o1')).toEqual({ sent: false, reason: 'Already sent this month' })
    expect(db.tables.reminder_dedup.map((r) => r.owner_id)).toEqual(['o1', 'o2'])
    vi.unstubAllEnvs()
  })
})

describe('przypomnienia o zaległościach na 2 kontach', () => {
  test('dedup (owner, najemca, miesiąc): to samo id najemcy w drugim koncie nie jest uznane za wysłane', async () => {
    now = new Date(2026, 5, 20)
    seed({})
    getTenantsWithBalancesMock.mockResolvedValue([{ id: 1, balance: -50 }])

    expect(await processLateReminders('o1')).toEqual({ sent: 1, skipped: 0 })
    expect(await processLateReminders('o2')).toEqual({ sent: 1, skipped: 0 })
    expect(await processLateReminders('o1')).toEqual({ sent: 0, skipped: 1 })
    expect(db.tables.reminder_dedup.map((r) => [r.owner_id, r.dedup_key])).toEqual([['o1', '1-2026-6'], ['o2', '1-2026-6']])
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'o1', actionName: 'lateReminder' }))
  })
})

describe('runForEachOwner', () => {
  test('błąd jednego konta nie przerywa pozostałych, wynik bez danych osobowych', async () => {
    seed({ app_config: [{ owner_id: 'o1' }, { owner_id: 'o2' }, { owner_id: 'o3' }] })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const results = await runForEachOwner(async (ownerId) => {
      if (ownerId === 'o1') throw new Error('boom')
      return { sent: ownerId }
    })

    expect(results).toEqual([
      { ownerId: 'o1', ok: false, error: 'boom' },
      { ownerId: 'o2', ok: true, sent: 'o2' },
      { ownerId: 'o3', ok: true, sent: 'o3' },
    ])
    expect(allOwnersFailed(results)).toBe(false)
  })

  test('allOwnersFailed: puste = nie, wszystkie błędy = tak', () => {
    expect(allOwnersFailed([])).toBe(false)
    expect(allOwnersFailed([{ ok: false }, { ok: false }])).toBe(true)
  })
})
