import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './helpers/fakeSupabase'

let db: FakeSupabase
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => db }))

const sendGmailMock = vi.fn(async (...args: [string, string]) => (void args, { id: 'm1' }))
vi.mock('@/lib/gmail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gmail')>()),
  sendGmail: (t: string, r: string) => sendGmailMock(t, r),
}))
const getAccessTokenMock = vi.fn(async (ownerId: string) => `token-${ownerId}`)
vi.mock('@/lib/google-connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/google-connection')>()),
  getAccessToken: (o: string) => getAccessTokenMock(o),
}))

const { GoogleNotConnectedError, GoogleReauthRequiredError } = await import('@/lib/google-connection')
const { GmailSendError } = await import('@/lib/gmail')
const { sendStatementUploadReminderEmail, assertEmailReady, cronEmailGate, isE2eMailStub, emailBlockMessage, EMAIL_NOT_CONNECTED_MESSAGE } = await import('@/lib/email')

const conn = (owner: string, email: string, status = 'connected') => ({ owner_id: owner, google_email: email, status })
const decode = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

beforeEach(() => {
  sendGmailMock.mockClear()
  getAccessTokenMock.mockClear()
  vi.stubEnv('VERCEL_ENV', 'preview')
})
afterEach(() => vi.unstubAllEnvs())

describe('sendEmail (przez sendStatementUploadReminderEmail)', () => {
  test('wysyła tokenem i z adresu Google TEGO konta, nie innego', async () => {
    db = createFakeSupabase({ email_logs: [], google_connections: [conn('A', 'a@gmail.example'), conn('B', 'b@gmail.example')] })
    await sendStatementUploadReminderEmail('A', 'admin@example.com', null, null)
    expect(sendGmailMock).toHaveBeenCalledTimes(1)
    const [token, raw] = sendGmailMock.mock.calls[0]
    expect(token).toBe('token-A')
    expect(decode(raw)).toContain('From: a@gmail.example')
    expect(decode(raw)).not.toContain('b@gmail.example')
    expect(db.tables.email_logs).toEqual([expect.objectContaining({ owner_id: 'A', to_email: 'admin@example.com' })])
  })

  test('brak połączenia: GoogleNotConnectedError, nic nie wysłane, brak email_logs', async () => {
    db = createFakeSupabase({ email_logs: [], google_connections: [conn('B', 'b@gmail.example')] })
    await expect(sendStatementUploadReminderEmail('A', 'x@example.com', null, null)).rejects.toBeInstanceOf(GoogleNotConnectedError)
    expect(sendGmailMock).not.toHaveBeenCalled()
    expect(db.tables.email_logs).toEqual([])
  })

  test('disconnected / needs_reauth blokują, każdy swoim błędem', async () => {
    db = createFakeSupabase({ google_connections: [conn('A', 'a@gmail.example', 'disconnected'), conn('B', 'b@gmail.example', 'needs_reauth')] })
    await expect(assertEmailReady('A')).rejects.toBeInstanceOf(GoogleNotConnectedError)
    await expect(assertEmailReady('B')).rejects.toBeInstanceOf(GoogleReauthRequiredError)
    expect(emailBlockMessage(new GoogleNotConnectedError())).toBe(EMAIL_NOT_CONNECTED_MESSAGE)
    expect(emailBlockMessage(new Error('inny'))).toBeNull()
  })

  test('401 z Gmaila: status needs_reauth i GoogleReauthRequiredError, bez email_logs', async () => {
    db = createFakeSupabase({ email_logs: [], google_connections: [conn('A', 'a@gmail.example')] })
    sendGmailMock.mockRejectedValueOnce(new GmailSendError('unauthenticated', true))
    await expect(sendStatementUploadReminderEmail('A', 'x@example.com', null, null)).rejects.toBeInstanceOf(GoogleReauthRequiredError)
    expect(db.tables.google_connections[0]).toMatchObject({ status: 'needs_reauth' })
    expect(db.tables.email_logs).toEqual([])
  })
})

describe('atrapa e2e (e2e_test__)', () => {
  test('poza produkcją pomija token i Gmail API, ale zapisuje email_logs', async () => {
    db = createFakeSupabase({ email_logs: [], google_connections: [conn('A', 'e2e_test__google@example.com')] })
    await sendStatementUploadReminderEmail('A', 'x@example.com', null, null)
    expect(getAccessTokenMock).not.toHaveBeenCalled()
    expect(sendGmailMock).not.toHaveBeenCalled()
    expect(db.tables.email_logs).toHaveLength(1)
  })

  test('na PRODUCTION atrapa się nie włącza: adres e2e_test__ idzie normalną drogą', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(isE2eMailStub('e2e_test__google@example.com')).toBe(false)
    db = createFakeSupabase({ email_logs: [], google_connections: [conn('A', 'e2e_test__google@example.com')] })
    await sendStatementUploadReminderEmail('A', 'x@example.com', null, null)
    expect(getAccessTokenMock).toHaveBeenCalledTimes(1)
    expect(sendGmailMock).toHaveBeenCalledTimes(1)
  })

  test('zwykły adres poza produkcją nie jest atrapą', () => {
    expect(isE2eMailStub('ktos@gmail.com')).toBe(false)
  })
})

describe('cronEmailGate', () => {
  test('połączone -> null; brak -> google_not_connected; needs_reauth -> Error(google_reauth_required)', async () => {
    db = createFakeSupabase({ google_connections: [conn('A', 'a@gmail.example'), conn('C', 'c@gmail.example', 'needs_reauth')] })
    await expect(cronEmailGate('A')).resolves.toBeNull()
    await expect(cronEmailGate('B')).resolves.toBe('google_not_connected')
    await expect(cronEmailGate('C')).rejects.toThrow('google_reauth_required')
  })
})
