import { describe, test, expect, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './helpers/fakeSupabase'

// Zapisy service rolą w logAudit i lib/email (email_logs) przechodzą przez strażnika fake'a:
// bez jawnego owner_id test by rzucił, a nie wpisał wiersza właścicielowi legacy.
let db: FakeSupabase
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: async () => ({}) }) } }))

const { logAudit } = await import('@/lib/audit')
const { sendStatementUploadReminderEmail, sendMediaEmail } = await import('@/lib/email')

describe('logAudit', () => {
  test('zapisuje owner_id podany w wpisie', async () => {
    db = createFakeSupabase({ audit_log: [] })
    await logAudit({ ownerId: 'o2', actionName: 'x', operation: 'CREATE' })
    expect(db.tables.audit_log).toEqual([expect.objectContaining({ owner_id: 'o2', action_name: 'x' })])
  })
})

describe('lib/email', () => {
  test('email_logs dostaje owner_id konta, w imieniu którego idzie wysyłka (nadawca wspólny)', async () => {
    vi.stubEnv('GMAIL_APP_PASSWORD', 'pw')
    db = createFakeSupabase({
      email_logs: [],
      legacy_owner: [{ id: 1, owner_id: 'o1' }],
      app_config: [{ owner_id: 'o1', admin_email: 'owner@example.com' }, { owner_id: 'o2', admin_email: 'drugi@example.com' }],
    })

    await sendStatementUploadReminderEmail('o2', 'x@example.com', null, null)

    expect(db.tables.email_logs).toEqual([expect.objectContaining({ owner_id: 'o2', to_email: 'x@example.com' })])
    vi.unstubAllEnvs()
  })

  test('domyślny szablon maila o mediach jest neutralny (bez nazwy firmy)', async () => {
    vi.stubEnv('GMAIL_APP_PASSWORD', 'pw')
    db = createFakeSupabase({ email_logs: [], legacy_owner: [{ id: 1, owner_id: 'o1' }], app_config: [{ owner_id: 'o1', admin_email: 'owner@example.com' }] })

    await sendMediaEmail('o2', 'a@example.com', 'Jan', '06/2026', 10, 6, 2026, [], null, null, null)

    const body = String(db.tables.email_logs[0].body)
    expect(body).toContain('rozliczenie mediów nr 06/2026')
    expect(body).not.toMatch(/BMT/)
    vi.unstubAllEnvs()
  })
})
