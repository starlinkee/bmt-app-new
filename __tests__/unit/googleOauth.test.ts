import { describe, expect, test, vi, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { buildAuthUrl, getConnectConfig, isAllowed, parseAllowlist } from '../../lib/google-oauth'

const KEY = randomBytes(32).toString('base64')
const FULL_ENV = {
  GOOGLE_CONNECT_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CONNECT_CLIENT_SECRET: 'sekret-klienta',
  GOOGLE_CONNECT_REDIRECT_URI: 'https://dev.example.test/api/google/callback',
  GOOGLE_CONNECT_ALLOWLIST: 'a@example.com',
  GOOGLE_TOKEN_KEY_V1: KEY,
}

afterEach(() => vi.unstubAllEnvs())

describe('parseAllowlist / isAllowed', () => {
  test('przecinki, spacje i wielkość liter; puste wpisy pomijane', () => {
    expect(parseAllowlist(' A@Example.com , b@example.com,, ')).toEqual(['a@example.com', 'b@example.com'])
    expect(isAllowed('  A@EXAMPLE.com ', parseAllowlist('a@example.com'))).toBe(true)
  })

  test('fail closed: brak lub pusta lista nie przepuszcza nikogo', () => {
    for (const raw of [undefined, '', '  ,  ']) {
      expect(parseAllowlist(raw)).toEqual([])
      expect(isAllowed('a@example.com', parseAllowlist(raw))).toBe(false)
    }
  })

  test('dokładne dopasowanie adresu, nie podciągu', () => {
    const list = parseAllowlist('a@example.com')
    expect(isAllowed('xa@example.com', list)).toBe(false)
    expect(isAllowed('a@example.com.evil.pl', list)).toBe(false)
  })
})

describe('getConnectConfig', () => {
  test('wszystko ustawione -> ok', () => {
    const c = getConnectConfig(FULL_ENV)
    expect(c.ok).toBe(true)
  })

  test('brakujące zmienne są wymienione po nazwach (bez wartości), nic nie rzuca', () => {
    const c = getConnectConfig({ GOOGLE_CONNECT_CLIENT_ID: 'x' })
    expect(c).toEqual({
      ok: false,
      missing: ['GOOGLE_CONNECT_CLIENT_SECRET', 'GOOGLE_CONNECT_REDIRECT_URI', 'GOOGLE_CONNECT_ALLOWLIST', 'GOOGLE_TOKEN_KEY_V1'],
    })
    expect(getConnectConfig({})).toMatchObject({ ok: false })
  })
})

describe('buildAuthUrl', () => {
  test('parametry: offline, consent, gmail.send, redirect_uri z env, state', () => {
    for (const [k, v] of Object.entries(FULL_ENV)) vi.stubEnv(k, v)
    const url = new URL(buildAuthUrl('stan-123'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const p = url.searchParams
    expect(p.get('client_id')).toBe(FULL_ENV.GOOGLE_CONNECT_CLIENT_ID)
    expect(p.get('redirect_uri')).toBe(FULL_ENV.GOOGLE_CONNECT_REDIRECT_URI)
    expect(p.get('response_type')).toBe('code')
    expect(p.get('access_type')).toBe('offline')
    expect(p.get('prompt')).toBe('consent')
    expect(p.get('include_granted_scopes')).toBe('true')
    expect(p.get('state')).toBe('stan-123')
    expect(p.get('scope')?.split(' ')).toEqual(['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'])
    expect(url.toString()).not.toContain(FULL_ENV.GOOGLE_CONNECT_CLIENT_SECRET)
  })

  test('bez konfiguracji rzuca błąd z kodem, nie z wartościami', () => {
    expect(() => buildAuthUrl('s')).toThrow(/config_missing/)
  })
})
