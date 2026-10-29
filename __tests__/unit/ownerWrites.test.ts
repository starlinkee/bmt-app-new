import { describe, test, expect, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './helpers/fakeSupabase'

// Zapisy service rolą w logAudit i lib/email (email_logs) przechodzą przez strażnika fake'a:
// bez jawnego owner_id test by rzucił, a nie wpisał wiersza właścicielowi legacy.
let db: FakeSupabase
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db }))
const sendGmailMock = vi.fn(async (_token: string, _raw: string) => ({ id: 'm1' }))
vi.mock('@/lib/gmail', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/gmail')>()), sendGmail: (t: string, r: string) => sendGmailMock(t, r) }))
vi.mock('@/lib/google-connection', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/google-connection')>()), getAccessToken: async (ownerId: string) => `token-${ownerId}` }))

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
  test('email_logs dostaje owner_id konta, w imieniu którego idzie wysyłka (nadawca = Gmail tego konta)', async () => {
    db = createFakeSupabase({
      email_logs: [],
      google_connections: [{ owner_id: 'o2', google_email: 'drugi@gmail.example', status: 'connected' }],
    })

    await sendStatementUploadReminderEmail('o2', 'x@example.com', null, null)

    expect(db.tables.email_logs).toEqual([expect.objectContaining({ owner_id: 'o2', to_email: 'x@example.com' })])
  })

  test('domyślny szablon maila o mediach jest neutralny (bez nazwy firmy)', async () => {
    db = createFakeSupabase({ email_logs: [], google_connections: [{ owner_id: 'o2', google_email: 'drugi@gmail.example', status: 'connected' }] })

    await sendMediaEmail('o2', 'a@example.com', 'Jan', '06/2026', 10, 6, 2026, [], null, null, null)

    const body = String(db.tables.email_logs[0].body)
    expect(body).toContain('rozliczenie mediów nr 06/2026')
    expect(body).not.toMatch(/BMT/)
  })
})
