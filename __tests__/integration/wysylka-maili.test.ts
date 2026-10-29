import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createIsolationUser, serviceClient, wipeAndDeleteUsers, type IsolationUser } from '../../tests-support/isolationUsers'
import { mailbox } from './helpers/runtime'

// Slice 7c: wysyłka maili przez Gmail API z połączonego konta. Mock tylko na granicy Gmaila i odświeżenia tokenu
// (setup.ts); odczyt połączenia, szyfrowanie sekretu, bramki cronów i dedup przypomnień są prawdziwe, na bazie preview.
// Konta A, B, C to użytkownicy testowi z izolacji - nie dotykamy połączenia właściciela.

// Lista kont dla cronów zawężona do kont testowych (reszta app-config zostaje prawdziwa).
const owners = vi.hoisted(() => ({ ids: [] as string[] }))
vi.mock('@/lib/app-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/app-config')>()),
  listOwnerIds: async () => owners.ids,
}))
// 16. dzień miesiąca: przypomnienie o wyciągu jest dziś aktywne.
vi.mock('@/lib/clock', () => ({ getCurrentDate: async () => new Date(2026, 8, 16, 8, 0, 0) }))

const { saveConnection } = await import('@/lib/google-connection')
const { sendStatementUploadReminderEmail } = await import('@/lib/email')
const statementReminderRoute = await import('@/app/api/cron/statement-reminder/route')

const admin = serviceClient({ strict: true })
const saved = { ...process.env }
let A: IsolationUser
let B: IsolationUser
let C: IsolationUser

const GOOGLE = { A: 'konto-a@gmail.example', C: 'konto-c@gmail.example' }
const SCOPES = ['https://www.googleapis.com/auth/gmail.send']
const decodeFrom = (u: IsolationUser) => `access-refresh-${u.id}`

beforeAll(async () => {
  process.env.GOOGLE_TOKEN_KEY_V1 = randomBytes(32).toString('base64')
  A = await createIsolationUser(admin, 'ma')
  B = await createIsolationUser(admin, 'mb')
  C = await createIsolationUser(admin, 'mc')
  owners.ids = [A.id, B.id, C.id]
  for (const u of [A, B, C]) {
    const { error } = await admin.from('app_config').upsert({ owner_id: u.id, admin_email: `admin-${u.id.slice(0, 8)}@example.invalid` }, { onConflict: 'owner_id' })
    if (error) throw error
  }
}, 120_000)

afterAll(async () => {
  try {
    if (A && B && C) await wipeAndDeleteUsers(admin, [A.id, B.id, C.id])
  } finally {
    process.env = saved
  }
}, 120_000)

beforeEach(async () => {
  for (const u of [A, B, C]) {
    await admin.from('google_credentials').delete().eq('owner_id', u.id)
    await admin.from('google_connections').delete().eq('owner_id', u.id)
    await admin.from('reminder_dedup').delete().eq('owner_id', u.id)
    await admin.from('email_logs').delete().eq('owner_id', u.id)
  }
})

const connect = (u: IsolationUser, email: string) => saveConnection(u.id, { refreshToken: `refresh-${u.id}`, scopes: SCOPES }, email)
const logsOf = async (u: IsolationUser) => (await admin.from('email_logs').select('id, to_email').eq('owner_id', u.id)).data ?? []

describe('nadawca i token per konto', () => {
  test('wysyłka konta A używa tokenu A (nie B) i ma From = adres Google A', async () => {
    await connect(A, GOOGLE.A)
    await connect(B, 'konto-b@gmail.example')

    await sendStatementUploadReminderEmail(A.id, 'odbiorca@example.invalid', null, null)

    expect(mailbox.sent).toHaveLength(1)
    expect(mailbox.sent[0].token).toBe(decodeFrom(A))
    expect(mailbox.sent[0].token).not.toBe(decodeFrom(B))
    expect(mailbox.sent[0].from).toBe(GOOGLE.A)
    expect(await logsOf(A)).toHaveLength(1)
    expect(await logsOf(B)).toHaveLength(0)
  })

  test('konto bez połączenia: błąd, brak wiadomości i brak wpisu w email_logs (mimo połączonego sąsiada)', async () => {
    await connect(A, GOOGLE.A)

    await expect(sendStatementUploadReminderEmail(B.id, 'odbiorca@example.invalid', null, null)).rejects.toThrow(/Konto nie ma połączenia z Google/)

    expect(mailbox.sent).toHaveLength(0)
    expect(await logsOf(B)).toHaveLength(0)
  })

  test('401 z Gmaila ustawia needs_reauth i nie zapisuje email_logs', async () => {
    await connect(A, GOOGLE.A)
    const { GmailSendError } = await import('@/lib/gmail')
    mailbox.failWith = new GmailSendError('unauthenticated', true)

    await expect(sendStatementUploadReminderEmail(A.id, 'odbiorca@example.invalid', null, null)).rejects.toThrow(/Wymagane ponowne połączenie/)

    const { data } = await admin.from('google_connections').select('status').eq('owner_id', A.id).single()
    expect(data?.status).toBe('needs_reauth')
    expect(await logsOf(A)).toHaveLength(0)
  })
})

describe('cron przypomnienia o wyciągu (trasa + prawdziwe przetwarzanie)', () => {
  const run = () =>
    statementReminderRoute.GET(new Request('https://bmt.test/api/cron/statement-reminder', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))

  test('połączone wysyła, bez połączenia pomija (bez reminder_dedup), needs_reauth = google_reauth_required', async () => {
    await connect(A, GOOGLE.A)
    // B: bez połączenia. C: połączenie, które wymaga ponownego autoryzowania.
    await connect(C, GOOGLE.C)
    await admin.from('google_connections').update({ status: 'needs_reauth', last_error: 'invalid_grant' }).eq('owner_id', C.id)

    const res = await run()
    const body = await res.json()

    expect(res.status).toBe(200)
    const byOwner = Object.fromEntries((body.results as { ownerId: string }[]).map((r) => [r.ownerId, r]))
    expect(byOwner[A.id]).toMatchObject({ ok: true, sent: true })
    expect(byOwner[B.id]).toMatchObject({ ok: true, sent: false, skipped: 'google_not_connected' })
    expect(byOwner[C.id]).toMatchObject({ ok: false, error: 'google_reauth_required' })

    expect(mailbox.sent).toHaveLength(1)
    expect(mailbox.sent[0].from).toBe(GOOGLE.A)
    const { data: dedup } = await admin.from('reminder_dedup').select('owner_id').in('owner_id', [A.id, B.id, C.id])
    expect(dedup?.map((r) => r.owner_id)).toEqual([A.id])
  })

  test('po połączeniu konta pominięte wcześniej przypomnienie da się wysłać w tym samym miesiącu', async () => {
    await run() // nikt nie jest połączony
    expect(mailbox.sent).toHaveLength(0)

    await connect(B, 'konto-b@gmail.example')
    await run()

    expect(mailbox.sent.map((m) => m.from)).toEqual(['konto-b@gmail.example'])
  })
})
