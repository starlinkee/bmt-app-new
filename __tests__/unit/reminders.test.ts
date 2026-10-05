import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './helpers/fakeSupabase'

const logAuditMock = vi.fn()
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAuditMock(...args) }))

let db: FakeSupabase
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db }))

// Wirtualny zegar: testy ustawiają "teraz" bez dotykania app_config.time_offset_ms.
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

const { processLateReminders } = await import('@/lib/late-reminders')
const { processStatementUploadReminder } = await import('@/lib/statement-reminder')
const { processMeterReadingReminder, getEligibleMeterReminderTenants } = await import('@/lib/meter-reading-reminder')

const DEDUP_UNIQUE = { reminder_dedup: ['action_name', 'dedup_key'] }

function freshDb(initial: Record<string, unknown[]> = {}) {
  db = createFakeSupabase({ reminder_dedup: [], ...initial } as never, { unique: DEDUP_UNIQUE })
}

beforeEach(() => {
  logAuditMock.mockReset()
  getTenantsWithBalancesMock.mockReset()
  sendStatementToTenantMock.mockReset()
  sendStatementUploadReminderEmailMock.mockReset()
  sendMeterReadingReminderEmailMock.mockReset()
  freshDb()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('processLateReminders', () => {
  const debtors = [
    { id: 1, balance: -500 },
    { id: 2, balance: 0 },
    { id: 3, balance: 200 },
    { id: 4, balance: -10 },
  ]

  test.each([1, 10, 14])('przed 15. dniem (%i.) nic nie wysyła', async (day) => {
    now = new Date(2026, 5, day)
    getTenantsWithBalancesMock.mockResolvedValue(debtors)

    const result = await processLateReminders()

    expect(result).toEqual({ sent: 0, skipped: 0, reason: 'Before 15th' })
    expect(sendStatementToTenantMock).not.toHaveBeenCalled()
  })

  test('od 15. dnia wysyła wyciąg tylko najemcom z zaległością (saldo < 0)', async () => {
    now = new Date(2026, 5, 15)
    getTenantsWithBalancesMock.mockResolvedValue(debtors)

    const result = await processLateReminders()

    expect(result).toEqual({ sent: 2, skipped: 0 })
    expect(sendStatementToTenantMock.mock.calls.map((c) => c[0])).toEqual([1, 4])
    expect(db.tables.reminder_dedup.map((r) => r.dedup_key)).toEqual(['1-2026-6', '4-2026-6'])
  })

  test('drugie wywołanie w tym samym miesiącu nie wysyła ponownie (dedup)', async () => {
    now = new Date(2026, 5, 20)
    getTenantsWithBalancesMock.mockResolvedValue(debtors)

    await processLateReminders()
    sendStatementToTenantMock.mockClear()
    const second = await processLateReminders()

    expect(second).toEqual({ sent: 0, skipped: 2 })
    expect(sendStatementToTenantMock).not.toHaveBeenCalled()
  })

  test('w kolejnym miesiącu wysyła ponownie', async () => {
    getTenantsWithBalancesMock.mockResolvedValue([{ id: 1, balance: -500 }])

    now = new Date(2026, 5, 20)
    await processLateReminders()
    now = new Date(2026, 6, 20)
    const july = await processLateReminders()

    expect(july).toEqual({ sent: 1, skipped: 0 })
    expect(sendStatementToTenantMock).toHaveBeenCalledTimes(2)
  })

  test('błąd wysyłki zwalnia zastrzeżenie, więc kolejny cron może spróbować ponownie', async () => {
    now = new Date(2026, 5, 20)
    getTenantsWithBalancesMock.mockResolvedValue([{ id: 1, balance: -500 }])
    sendStatementToTenantMock.mockRejectedValueOnce(new Error('SMTP down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const first = await processLateReminders()
    expect(first).toEqual({ sent: 0, skipped: 1 })
    expect(db.tables.reminder_dedup).toHaveLength(0)

    const retry = await processLateReminders()
    expect(retry).toEqual({ sent: 1, skipped: 0 })
  })
})

describe('processStatementUploadReminder', () => {
  const config = { id: 1, admin_email: 'admin@example.com', statement_upload_reminder_subject: 'S', statement_upload_reminder_body: 'B' }

  test.each([1, 15, 17, 31])('inny dzień niż 16. (%i.) — nie wysyła', async (day) => {
    now = new Date(2026, 4, day)
    freshDb({ app_config: [config] })

    const result = await processStatementUploadReminder()

    expect(result).toEqual({ sent: false, reason: 'Not the 16th' })
    expect(sendStatementUploadReminderEmailMock).not.toHaveBeenCalled()
  })

  test('16. dnia wysyła do admina z ustawionym tematem i treścią', async () => {
    now = new Date(2026, 5, 16)
    freshDb({ app_config: [config] })

    const result = await processStatementUploadReminder()

    expect(result).toEqual({ sent: true })
    expect(sendStatementUploadReminderEmailMock).toHaveBeenCalledWith('admin@example.com', 'S', 'B')
    expect(db.tables.reminder_dedup).toEqual([
      expect.objectContaining({ action_name: 'statementUploadReminder', dedup_key: '2026-6' }),
    ])
  })

  test('brak adresu admina -> nie wysyła i nie zastrzega miesiąca', async () => {
    now = new Date(2026, 5, 16)
    freshDb({ app_config: [{ id: 1, admin_email: null }] })

    const result = await processStatementUploadReminder()

    expect(result.sent).toBe(false)
    expect(sendStatementUploadReminderEmailMock).not.toHaveBeenCalled()
    expect(db.tables.reminder_dedup).toHaveLength(0)
  })

  test('drugie wywołanie tego samego dnia nie wysyła ponownie', async () => {
    now = new Date(2026, 5, 16)
    freshDb({ app_config: [config] })

    await processStatementUploadReminder()
    const second = await processStatementUploadReminder()

    expect(second).toEqual({ sent: false, reason: 'Already sent this month' })
    expect(sendStatementUploadReminderEmailMock).toHaveBeenCalledTimes(1)
  })

  test('błąd wysyłki zwalnia zastrzeżenie i rzuca dalej', async () => {
    now = new Date(2026, 5, 16)
    freshDb({ app_config: [config] })
    sendStatementUploadReminderEmailMock.mockRejectedValueOnce(new Error('SMTP down'))

    await expect(processStatementUploadReminder()).rejects.toThrow('SMTP down')
    expect(db.tables.reminder_dedup).toHaveLength(0)

    await expect(processStatementUploadReminder()).resolves.toEqual({ sent: true })
  })
})

describe('meter reading reminder', () => {
  const eligibleData = () => ({
    tenants: [
      // spełnia wszystko
      { id: 1, first_name: 'Jan', last_name: 'Nowak', email: 'jan@example.com', email2: 'jan2@example.com', property_id: 10, reading_token: 'tok1', contracts: [{ is_active: true, has_media_invoice: true }] },
      // brak e-maila
      { id: 2, first_name: 'Ewa', last_name: 'Bez', email: null, email2: null, property_id: 10, reading_token: 'tok2', contracts: [{ is_active: true, has_media_invoice: true }] },
      // umowa bez mediów
      { id: 3, first_name: 'Adam', last_name: 'BezMediow', email: 'a@example.com', email2: null, property_id: 10, reading_token: 'tok3', contracts: [{ is_active: true, has_media_invoice: false }] },
      // umowa nieaktywna
      { id: 4, first_name: 'Ola', last_name: 'Nieaktywna', email: 'o@example.com', email2: null, property_id: 10, reading_token: 'tok4', contracts: [{ is_active: false, has_media_invoice: true }] },
      // brak kluczy odczytów
      { id: 5, first_name: 'Piotr', last_name: 'BezKluczy', email: 'p@example.com', email2: null, property_id: 10, reading_token: 'tok5', contracts: [{ is_active: true, has_media_invoice: true }] },
    ],
    settlement_group_properties: [{ property_id: 10, settlement_group_id: 100 }],
    settlement_groups: [{ id: 100, tenant_reading_keys: { '1': ['woda', 'prad'], '2': ['woda'], '3': ['woda'], '4': ['woda'], '5': [] } }],
    app_config: [{ id: 1, meter_reading_reminder_subject: 'Temat', meter_reading_reminder_body: 'Treść' }],
  })

  test('getEligibleMeterReminderTenants: tylko aktywna umowa z mediami, e-mail i klucze odczytów', async () => {
    freshDb(eligibleData())

    const eligible = await getEligibleMeterReminderTenants()

    expect(eligible).toEqual([{ id: 1, name: 'Jan Nowak', emails: ['jan@example.com', 'jan2@example.com'] }])
  })

  test.each([
    [new Date(2026, 5, 29), false],
    [new Date(2026, 5, 30), true], // czerwiec ma 30 dni
    [new Date(2026, 0, 31), true],
    [new Date(2028, 1, 28), false], // 2028 jest przestępny
    [new Date(2028, 1, 29), true],
    [new Date(2027, 1, 28), true],
  ])('ostatni dzień miesiąca: %s -> %s', async (date, shouldSend) => {
    now = date
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    freshDb(eligibleData())

    const result = await processMeterReadingReminder()

    expect(result.sent).toBe(shouldSend)
    if (!shouldSend) expect(result.reason).toBe('Not the last day of month')
  })

  test('ostatniego dnia wysyła link z tokenem do wszystkich adresów najemcy', async () => {
    now = new Date(2026, 5, 30)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    freshDb(eligibleData())

    const result = await processMeterReadingReminder()

    expect(result).toMatchObject({ sent: true, count: 1 })
    expect(sendMeterReadingReminderEmailMock).toHaveBeenCalledTimes(1)
    expect(sendMeterReadingReminderEmailMock).toHaveBeenCalledWith(
      ['jan@example.com', 'jan2@example.com'],
      'Jan Nowak',
      'https://app.example.com/odczyty/tok1',
      'Temat',
      'Treść',
    )
  })

  test('drugie wywołanie tego samego dnia nie wysyła ponownie', async () => {
    now = new Date(2026, 5, 30)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    freshDb(eligibleData())

    await processMeterReadingReminder()
    const second = await processMeterReadingReminder()

    expect(second).toEqual({ sent: false, reason: 'Already sent this month' })
    expect(sendMeterReadingReminderEmailMock).toHaveBeenCalledTimes(1)
  })

  test('brak NEXT_PUBLIC_APP_URL -> nie wysyła i zwalnia zastrzeżenie', async () => {
    now = new Date(2026, 5, 30)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    freshDb(eligibleData())

    const result = await processMeterReadingReminder()

    expect(result).toEqual({ sent: false, reason: 'NEXT_PUBLIC_APP_URL not configured' })
    expect(sendMeterReadingReminderEmailMock).not.toHaveBeenCalled()
    expect(db.tables.reminder_dedup).toHaveLength(0)
  })

  test('błąd wysyłki do jednego najemcy jest raportowany i nie przerywa reszty', async () => {
    now = new Date(2026, 5, 30)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    const data = eligibleData()
    data.tenants.push({
      id: 6, first_name: 'Kasia', last_name: 'Druga', email: 'k@example.com', email2: null, property_id: 10, reading_token: 'tok6',
      contracts: [{ is_active: true, has_media_invoice: true }],
    })
    ;(data.settlement_groups[0].tenant_reading_keys as Record<string, string[]>)['6'] = ['woda']
    freshDb(data)
    sendMeterReadingReminderEmailMock.mockRejectedValueOnce(new Error('SMTP down'))

    const result = await processMeterReadingReminder()

    expect(result).toMatchObject({ sent: true, count: 1 })
    expect(result.results).toEqual([
      expect.objectContaining({ tenantId: 1, error: 'SMTP down' }),
      expect.objectContaining({ tenantId: 6 }),
    ])
  })
})
