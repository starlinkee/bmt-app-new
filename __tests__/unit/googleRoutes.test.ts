import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

const session = vi.fn()
vi.mock('@/lib/auth-guard', () => ({ getApiUserClient: () => session() }))

const oauth = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  fetchUserInfo: vi.fn(),
  revokeToken: vi.fn(),
  config: vi.fn(),
}))
vi.mock('@/lib/google-oauth', async () => {
  const actual = await vi.importActual<typeof import('../../lib/google-oauth')>('../../lib/google-oauth')
  return { ...actual, exchangeCode: oauth.exchangeCode, fetchUserInfo: oauth.fetchUserInfo, revokeToken: oauth.revokeToken, getConnectConfig: oauth.config }
})
const connection = vi.hoisted(() => ({ saveConnection: vi.fn() }))
vi.mock('@/lib/google-connection', () => connection)

const callback = await import('@/app/api/google/callback/route')
const connect = await import('@/app/api/google/connect/route')

const ORIGIN = 'https://app.example.test'
const USER = 'unit-test-user'
const SECRET_TOKEN = 'ya29.TAJNY-ACCESS'
const SECRET_REFRESH = '1//TAJNY-REFRESH'
const SECRET_CODE = '4/TAJNY-KOD'
const CONFIG = { ok: true, clientId: 'cid', clientSecret: 'csec', redirectUri: `${ORIGIN}/api/google/callback`, allowlist: ['a@example.com'] }

function cbRequest(query: Record<string, string>, cookie?: string) {
  const url = new URL(`${ORIGIN}/api/google/callback`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url, cookie ? { headers: { cookie: `google_oauth_state=${cookie}` } } : undefined)
}
const location = (res: Response) => res.headers.get('location') ?? ''
const happyTokens = { accessToken: SECRET_TOKEN, refreshToken: SECRET_REFRESH, scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'] }

beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ user: { id: USER } })
  oauth.config.mockReturnValue(CONFIG)
  oauth.exchangeCode.mockResolvedValue(happyTokens)
  oauth.fetchUserInfo.mockResolvedValue({ email: 'A@Example.com', emailVerified: true })
  oauth.revokeToken.mockResolvedValue(true)
  connection.saveConnection.mockResolvedValue(undefined)
})

describe('GET /api/google/callback', () => {
  const good = { state: 'S', code: SECRET_CODE }
  const goodCookie = `S.${USER}`

  test('sukces: zapisuje połączenie z e-mailem małymi literami i przekierowuje na connected', async () => {
    const res = await callback.GET(cbRequest(good, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=connected`)
    expect(connection.saveConnection).toHaveBeenCalledWith(USER, { refreshToken: SECRET_REFRESH, scopes: happyTokens.scopes }, 'a@example.com')
    expect(res.headers.get('set-cookie')).toMatch(/google_oauth_state=;.*Max-Age=0/i)
  })

  test('brak sesji -> /login, nic nie woła Google ani bazy', async () => {
    session.mockResolvedValue(null)
    const res = await callback.GET(cbRequest(good, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/login`)
    expect(oauth.exchangeCode).not.toHaveBeenCalled()
    expect(connection.saveConnection).not.toHaveBeenCalled()
  })

  test.each([
    ['brak ciasteczka', good, undefined],
    ['inny state w ciasteczku', good, `INNY.${USER}`],
    ['state powiązany z innym kontem', good, 'S.inne-konto'],
    ['brak state w query', { code: SECRET_CODE }, goodCookie],
    // state ma pierwszeństwo przed błędem od Google: cudzy redirect nie może niczego wywołać.
    ['zły state mimo error=access_denied', { state: 'X', error: 'access_denied' }, goodCookie],
  ])('state_invalid: %s -> brak wymiany kodu i zapisu, ciasteczko skasowane', async (_n, query, cookie) => {
    const res = await callback.GET(cbRequest(query, cookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=state_invalid`)
    expect(oauth.exchangeCode).not.toHaveBeenCalled()
    expect(connection.saveConnection).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/i)
  })

  test('access_denied od Google -> komunikat, bez wymiany kodu', async () => {
    const res = await callback.GET(cbRequest({ state: 'S', error: 'access_denied' }, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=access_denied`)
    expect(oauth.exchangeCode).not.toHaveBeenCalled()
  })

  test('inny błąd od Google -> error', async () => {
    const res = await callback.GET(cbRequest({ state: 'S', error: 'server_error' }, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=error`)
  })

  test('adres spoza listy -> not_allowed, revoke tokenu, brak zapisu', async () => {
    oauth.fetchUserInfo.mockResolvedValue({ email: 'ktos@inna.pl', emailVerified: true })
    const res = await callback.GET(cbRequest(good, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=not_allowed`)
    expect(oauth.revokeToken).toHaveBeenCalledWith(SECRET_REFRESH)
    expect(connection.saveConnection).not.toHaveBeenCalled()
  })

  test('niezweryfikowany e-mail -> not_allowed nawet na liście', async () => {
    oauth.fetchUserInfo.mockResolvedValue({ email: 'a@example.com', emailVerified: false })
    const res = await callback.GET(cbRequest(good, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=not_allowed`)
    expect(connection.saveConnection).not.toHaveBeenCalled()
  })

  test('brak zakresu gmail.send -> scope_missing, revoke, brak zapisu', async () => {
    oauth.exchangeCode.mockResolvedValue({ ...happyTokens, scopes: ['openid', 'email'] })
    const res = await callback.GET(cbRequest(good, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=scope_missing`)
    expect(oauth.revokeToken).toHaveBeenCalled()
    expect(connection.saveConnection).not.toHaveBeenCalled()
  })

  test('brak refresh tokenu -> no_refresh_token, brak zapisu', async () => {
    oauth.exchangeCode.mockResolvedValue({ ...happyTokens, refreshToken: null })
    const res = await callback.GET(cbRequest(good, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=no_refresh_token`)
    expect(connection.saveConnection).not.toHaveBeenCalled()
  })

  test('brak konfiguracji -> config_missing', async () => {
    oauth.config.mockReturnValue({ ok: false, missing: ['GOOGLE_CONNECT_CLIENT_ID'] })
    const res = await callback.GET(cbRequest(good, goodCookie))
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=config_missing`)
  })

  test('błąd wymiany kodu lub zapisu -> error; logi i odpowiedź bez kodu/tokenów', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    oauth.exchangeCode.mockRejectedValueOnce(new Error(`boom ${SECRET_CODE} ${SECRET_TOKEN}`))
    const r1 = await callback.GET(cbRequest(good, goodCookie))
    connection.saveConnection.mockRejectedValueOnce(new Error(`db ${SECRET_REFRESH}`))
    const r2 = await callback.GET(cbRequest(good, goodCookie))
    expect(location(r1)).toBe(`${ORIGIN}/ustawienia?google=error`)
    expect(location(r2)).toBe(`${ORIGIN}/ustawienia?google=error`)
    const dump = JSON.stringify([errors.mock.calls, [...r1.headers], [...r2.headers]])
    for (const secret of [SECRET_CODE, SECRET_TOKEN, SECRET_REFRESH, 'csec']) expect(dump).not.toContain(secret)
    errors.mockRestore()
  })
})

describe('GET /api/google/connect', () => {
  const req = () => new NextRequest(`${ORIGIN}/api/google/connect`)

  test('brak sesji -> /login', async () => {
    session.mockResolvedValue(null)
    expect(location(await connect.GET(req()))).toBe(`${ORIGIN}/login`)
  })

  test('brak konfiguracji -> /ustawienia?google=config_missing, bez ciasteczka', async () => {
    oauth.config.mockReturnValue({ ok: false, missing: ['X'] })
    const res = await connect.GET(req())
    expect(location(res)).toBe(`${ORIGIN}/ustawienia?google=config_missing`)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  test('z konfiguracją: 302 na Google, ciasteczko state HttpOnly/Secure/Lax o ścieżce callbacku powiązane z kontem', async () => {
    vi.stubEnv('GOOGLE_CONNECT_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CONNECT_CLIENT_SECRET', 'csec')
    vi.stubEnv('GOOGLE_CONNECT_REDIRECT_URI', `${ORIGIN}/api/google/callback`)
    vi.stubEnv('GOOGLE_CONNECT_ALLOWLIST', 'a@example.com')
    vi.stubEnv('GOOGLE_TOKEN_KEY_V1', Buffer.alloc(32, 1).toString('base64'))
    oauth.config.mockReturnValue(CONFIG)
    const res = await connect.GET(req())
    const url = new URL(location(res))
    expect(url.host).toBe('accounts.google.com')
    const state = url.searchParams.get('state')!
    expect(Buffer.from(state, 'base64url')).toHaveLength(32)
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain(`google_oauth_state=${state}.${USER}`)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toContain('Path=/api/google/callback')
    expect(cookie).toMatch(/Max-Age=600/i)
    vi.unstubAllEnvs()
  })
})
