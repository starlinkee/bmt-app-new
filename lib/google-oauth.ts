import 'server-only'
import { availableKeyVersions } from '@/lib/secret-box'

// Jedyna granica do Google OAuth: cienkie funkcje na fetch (łatwe do zamockowania w testach).
// Zmienne GOOGLE_CONNECT_* są OSOBNE od GOOGLE_OAUTH_* (te obsługują driveEngine do slice 7d; refresh token jest
// związany z klientem OAuth, więc nadpisanie ich nowym klientem zepsułoby Drive).
// Błędy niosą wyłącznie kod (np. invalid_grant) - nigdy kodu autoryzacji, tokenów ani sekretu klienta.

export const STATE_COOKIE = 'google_oauth_state'
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const TIMEOUT_MS = 8000

export type ConnectConfig = { clientId: string; clientSecret: string; redirectUri: string; allowlist: string[] }

/** Adresy po przecinku -> lowercase, bez spacji i pustych. Pusta/brak = pusta lista (nikt nie przejdzie: fail closed). */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowed(email: string, allowlist: string[]): boolean {
  return allowlist.includes(email.trim().toLowerCase())
}

/** Nigdy nie rzuca (import i build bez zmiennych muszą działać): zwraca listę brakujących nazw. */
export function getConnectConfig(env: Record<string, string | undefined> = process.env): ({ ok: true } & ConnectConfig) | { ok: false; missing: string[] } {
  const clientId = env.GOOGLE_CONNECT_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_CONNECT_CLIENT_SECRET?.trim()
  const redirectUri = env.GOOGLE_CONNECT_REDIRECT_URI?.trim()
  const allowlist = parseAllowlist(env.GOOGLE_CONNECT_ALLOWLIST)
  const missing = [
    !clientId && 'GOOGLE_CONNECT_CLIENT_ID',
    !clientSecret && 'GOOGLE_CONNECT_CLIENT_SECRET',
    !redirectUri && 'GOOGLE_CONNECT_REDIRECT_URI',
    allowlist.length === 0 && 'GOOGLE_CONNECT_ALLOWLIST',
    availableKeyVersions(env).length === 0 && 'GOOGLE_TOKEN_KEY_V1',
  ].filter((x): x is string => !!x)
  if (missing.length > 0 || !clientId || !clientSecret || !redirectUri) return { ok: false, missing }
  return { ok: true, clientId, clientSecret, redirectUri, allowlist }
}

/** Błąd wywołania Google; `code` to kod OAuth (invalid_grant, ...) albo http_<status> / network. */
export class GoogleOAuthError extends Error {
  readonly code: string
  constructor(code: string) {
    super(`Google OAuth: ${code}`)
    this.name = 'GoogleOAuthError'
    this.code = code
  }
}

function requireConfig() {
  const config = getConnectConfig()
  if (!config.ok) throw new GoogleOAuthError('config_missing')
  return config
}

export function buildAuthUrl(state: string): string {
  const config = requireConfig()
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: `openid email ${GMAIL_SEND_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

async function postForm(url: string, body: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> }> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new GoogleOAuthError('network')
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json }
}

function errorCode(status: number, json: Record<string, unknown>) {
  return typeof json.error === 'string' && /^[a-z_]{1,40}$/.test(json.error) ? json.error : `http_${status}`
}

export type TokenResponse = { accessToken: string; refreshToken: string | null; scopes: string[] }

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const config = requireConfig()
  const { status, json } = await postForm(TOKEN_URL, {
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })
  if (status !== 200 || typeof json.access_token !== 'string') throw new GoogleOAuthError(errorCode(status, json))
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    scopes: typeof json.scope === 'string' ? json.scope.split(/\s+/).filter(Boolean) : [],
  }
}

export async function fetchUserInfo(accessToken: string): Promise<{ email: string; emailVerified: boolean }> {
  let res: Response
  try {
    res = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new GoogleOAuthError('network')
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof json.email !== 'string') throw new GoogleOAuthError(errorCode(res.status, json))
  return { email: json.email, emailVerified: json.email_verified === true }
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  const config = requireConfig()
  const { status, json } = await postForm(TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  })
  if (status !== 200 || typeof json.access_token !== 'string') throw new GoogleOAuthError(errorCode(status, json))
  return { accessToken: json.access_token }
}

/** Best effort: nigdy nie rzuca; zwraca czy Google potwierdziło unieważnienie. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const { status } = await postForm(REVOKE_URL, { token })
    return status === 200
  } catch {
    return false
  }
}
