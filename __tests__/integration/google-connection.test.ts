import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import { createIsolationUser, serviceClient, wipeAndDeleteUsers, type IsolationUser } from '../../tests-support/isolationUsers'
import { decryptSecret, fromPgBytea } from '../../lib/secret-box'

// Slice 7b: połączenie konta z Google na prawdziwej bazie preview. Mock tylko na granicy lib/google-oauth
// (wymiana kodu, userinfo, odświeżenie, revoke); konfiguracja, szyfrowanie i zapis są prawdziwe.

const current = vi.hoisted(() => ({ userId: '' }))
vi.mock('@/lib/auth-guard', () => ({
  getApiUserClient: async () => ({ user: { id: current.userId } }),
  requireUser: async () => ({ user: { id: current.userId } }),
}))
const google = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  fetchUserInfo: vi.fn(),
  refreshAccessToken: vi.fn(),
  revokeToken: vi.fn(),
}))
vi.mock('@/lib/google-oauth', async () => {
  const actual = await vi.importActual<typeof import('../../lib/google-oauth')>('../../lib/google-oauth')
  return { ...actual, ...google }
})

const callback = await import('@/app/api/google/callback/route')
const { getAccessToken, disconnect, GoogleReauthRequiredError } = await import('@/lib/google-connection')
const { GoogleOAuthError } = await import('@/lib/google-oauth')

const ORIGIN = 'https://app.example.test'
const ACCESS = 'ya29.INTEGRACJA-ACCESS'
const REFRESH = '1//INTEGRACJA-REFRESH'
const CODE = '4/INTEGRACJA-KOD'
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send']
const EMAIL = 'e2e_test__google@example.com'
const KEY_NAME = 'GOOGLE_TOKEN_KEY_V1'

const admin = serviceClient({ strict: true })
let A: IsolationUser
let B: IsolationUser
let keyB64: string
const saved = { ...process.env }

const cb = (user: IsolationUser, query: Record<string, string>, cookie?: string) => {
  current.userId = user.id
  const url = new URL(`${ORIGIN}/api/google/callback`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return callback.GET(new NextRequest(url, cookie ? { headers: { cookie: `google_oauth_state=${cookie}` } } : undefined))
}
const rows = async (owner: string) => ({
  cred: (await admin.from('google_credentials').select('*').eq('owner_id', owner)).data ?? [],
  conn: (await admin.from('google_connections').select('*').eq('owner_id', owner)).data ?? [],
})
const wipe = async () => {
  for (const u of [A, B]) {
    await admin.from('google_credentials').delete().eq('owner_id', u.id)
    await admin.from('google_connections').delete().eq('owner_id', u.id)
  }
}

beforeAll(async () => {
  keyB64 = randomBytes(32).toString('base64')
  process.env[KEY_NAME] = keyB64
  process.env.GOOGLE_CONNECT_CLIENT_ID = 'cid'
  process.env.GOOGLE_CONNECT_CLIENT_SECRET = 'csec-integracja'
  process.env.GOOGLE_CONNECT_REDIRECT_URI = `${ORIGIN}/api/google/callback`
  process.env.GOOGLE_CONNECT_ALLOWLIST = ` ${EMAIL.toUpperCase()} `
  A = await createIsolationUser(admin, 'ga')
  B = await createIsolationUser(admin, 'gb')
}, 120_000)

afterAll(async () => {
  try {
    if (A && B) await wipeAndDeleteUsers(admin, [A.id, B.id])
  } finally {
    process.env = saved
  }
}, 120_000)

beforeEach(async () => {
  vi.clearAllMocks()
  await wipe()
  google.exchangeCode.mockResolvedValue({ accessToken: ACCESS, refreshToken: REFRESH, scopes: SCOPES })
  google.fetchUserInfo.mockResolvedValue({ email: EMAIL, emailVerified: true })
  google.refreshAccessToken.mockResolvedValue({ accessToken: ACCESS })
  google.revokeToken.mockResolvedValue(true)
})

const connectA = () => cb(A, { state: 'S', code: CODE }, `S.${A.id}`)

describe('callback: kod -> tokeny -> wiersze', () => {
  test('sukces: sekret zaszyfrowany (odszyfrowuje się kluczem testowym, AAD = konto A), status connected', async () => {
    const res = await connectA()
    expect(res.headers.get('location')).toBe(`${ORIGIN}/ustawienia?google=connected`)

    const { cred, conn } = await rows(A.id)
    expect(cred).toHaveLength(1)
    expect(cred[0].key_version).toBe(1)
    const sealed = { ct: fromPgBytea(cred[0].refresh_token_ct), iv: fromPgBytea(cred[0].iv), keyVersion: 1 }
    expect(sealed.ct.toString('utf8')).not.toContain(REFRESH)
    expect(decryptSecret(sealed, A.id)).toBe(REFRESH)
    expect(() => decryptSecret(sealed, B.id)).toThrow()

    expect(conn).toHaveLength(1)
    expect(conn[0]).toMatchObject({ owner_id: A.id, status: 'connected', google_email: EMAIL, last_error: null, scopes: SCOPES })
    expect(conn[0].connected_at).toBeTruthy()
    // Konto B nie dostaje niczego.
    expect(await rows(B.id)).toEqual({ cred: [], conn: [] })
  })

  test('ponowne połączenie nadpisuje sekret i zachowuje template_file_id/folder_id', async () => {
    await connectA()
    await admin.from('google_connections').update({ template_file_id: 'tpl', folder_id: 'fld' }).eq('owner_id', A.id)
    google.exchangeCode.mockResolvedValue({ accessToken: ACCESS, refreshToken: `${REFRESH}-2`, scopes: SCOPES })
    await connectA()
    const { cred, conn } = await rows(A.id)
    expect(cred).toHaveLength(1)
    expect(decryptSecret({ ct: fromPgBytea(cred[0].refresh_token_ct), iv: fromPgBytea(cred[0].iv), keyVersion: 1 }, A.id)).toBe(`${REFRESH}-2`)
    expect(conn[0]).toMatchObject({ template_file_id: 'tpl', folder_id: 'fld', status: 'connected' })
  })

  test('adres spoza listy -> brak wierszy, revoke otrzymanego tokenu', async () => {
    google.fetchUserInfo.mockResolvedValue({ email: 'obcy@inna.pl', emailVerified: true })
    const res = await connectA()
    expect(res.headers.get('location')).toBe(`${ORIGIN}/ustawienia?google=not_allowed`)
    expect(await rows(A.id)).toEqual({ cred: [], conn: [] })
    expect(google.revokeToken).toHaveBeenCalledWith(REFRESH)
  })

  test('zły state -> brak wierszy i brak wymiany kodu', async () => {
    const res = await cb(A, { state: 'S', code: CODE }, `INNY.${A.id}`)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/ustawienia?google=state_invalid`)
    expect(await rows(A.id)).toEqual({ cred: [], conn: [] })
    expect(google.exchangeCode).not.toHaveBeenCalled()
  })

  test('state wystawiony dla konta B nie działa na koncie A', async () => {
    const res = await cb(A, { state: 'S', code: CODE }, `S.${B.id}`)
    expect(res.headers.get('location')).toContain('google=state_invalid')
    expect(await rows(A.id)).toEqual({ cred: [], conn: [] })
  })
})

describe('getAccessToken', () => {
  test('sukces: zwraca token i ustawia last_ok_at', async () => {
    await connectA()
    expect(await getAccessToken(A.id)).toBe(ACCESS)
    expect(google.refreshAccessToken).toHaveBeenCalledWith(REFRESH)
    expect((await rows(A.id)).conn[0].last_ok_at).toBeTruthy()
  })

  test('invalid_grant -> needs_reauth, last_error=invalid_grant, typowany błąd', async () => {
    await connectA()
    google.refreshAccessToken.mockRejectedValue(new GoogleOAuthError('invalid_grant'))
    await expect(getAccessToken(A.id)).rejects.toBeInstanceOf(GoogleReauthRequiredError)
    expect((await rows(A.id)).conn[0]).toMatchObject({ status: 'needs_reauth', last_error: 'invalid_grant' })
  })

  test('inny błąd Google (sieć) nie zmienia statusu', async () => {
    await connectA()
    google.refreshAccessToken.mockRejectedValue(new GoogleOAuthError('network'))
    await expect(getAccessToken(A.id)).rejects.toBeInstanceOf(GoogleOAuthError)
    expect((await rows(A.id)).conn[0].status).toBe('connected')
  })

  test('utracony klucz -> needs_reauth (key_unavailable)', async () => {
    await connectA()
    delete process.env[KEY_NAME]
    try {
      await expect(getAccessToken(A.id)).rejects.toBeInstanceOf(GoogleReauthRequiredError)
    } finally {
      process.env[KEY_NAME] = keyB64
    }
    expect((await rows(A.id)).conn[0]).toMatchObject({ status: 'needs_reauth', last_error: 'key_unavailable' })
  })
})

describe('disconnect', () => {
  test('revoke z właściwym tokenem, sekret skasowany, status disconnected', async () => {
    await connectA()
    const out = await disconnect(A.id)
    expect(out.revoked).toBe(true)
    expect(google.revokeToken).toHaveBeenCalledWith(REFRESH)
    const { cred, conn } = await rows(A.id)
    expect(cred).toEqual([])
    expect(conn[0]).toMatchObject({ status: 'disconnected', last_error: null })
  })

  test('błąd revoke nie blokuje odłączenia', async () => {
    await connectA()
    google.revokeToken.mockRejectedValue(new Error('Google niedostępne'))
    await disconnect(A.id)
    const { cred, conn } = await rows(A.id)
    expect(cred).toEqual([])
    expect(conn[0].status).toBe('disconnected')
  })

  test('utracony klucz nie blokuje odłączenia (bez revoke)', async () => {
    await connectA()
    delete process.env[KEY_NAME]
    try {
      await disconnect(A.id)
    } finally {
      process.env[KEY_NAME] = keyB64
    }
    expect(google.revokeToken).not.toHaveBeenCalled()
    expect((await rows(A.id)).cred).toEqual([])
  })

  test('odłączenie konta A nie rusza konta B', async () => {
    await connectA()
    current.userId = B.id
    await cb(B, { state: 'S', code: CODE }, `S.${B.id}`)
    await disconnect(A.id)
    expect((await rows(B.id)).cred).toHaveLength(1)
    expect((await rows(B.id)).conn[0].status).toBe('connected')
  })
})

describe('sekrety nie wyciekają', () => {
  test('odpowiedzi, wyniki i logi z całego przepływu nie zawierają tokenów, kodu ani sekretu klienta', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const seen: unknown[] = []
    seen.push(await connectA())
    seen.push(await cb(A, { state: 'X', code: CODE }, `S.${A.id}`))
    google.exchangeCode.mockRejectedValueOnce(new Error(`awaria ${CODE} ${ACCESS}`))
    seen.push(await connectA())
    google.refreshAccessToken.mockRejectedValue(new GoogleOAuthError('invalid_grant'))
    seen.push(await getAccessToken(A.id).catch((e: unknown) => e))
    seen.push(await disconnect(A.id))
    const dump = JSON.stringify([seen.map((r) => (r instanceof Response ? [r.status, [...r.headers]] : String(r))), spies.map((s) => s.mock.calls)])
    spies.forEach((s) => s.mockRestore())
    for (const secret of [ACCESS, REFRESH, CODE, 'csec-integracja', keyB64]) expect(dump).not.toContain(secret)
  })
})
