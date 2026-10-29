import { NextResponse, type NextRequest } from 'next/server'
import { getApiUserClient } from '@/lib/auth-guard'
import { saveConnection } from '@/lib/google-connection'
import { GMAIL_SEND_SCOPE, STATE_COOKIE, exchangeCode, fetchUserInfo, getConnectConfig, isAllowed, revokeToken } from '@/lib/google-oauth'

// Powrót z Google. Kolejność kontroli (każda odmowa = redirect na /ustawienia?google=<kod>, BRAK zapisu tokenu):
// sesja -> state -> błąd Google -> wymiana kodu -> e-mail zweryfikowany i na liście -> zakres gmail.send -> refresh token.
// Odpowiedzi i logi nie zawierają kodu, tokenów ani sekretu klienta (w logach tylko kody błędów).

function done(req: NextRequest, code: string) {
  const res = NextResponse.redirect(new URL(`/ustawienia?google=${code}`, req.nextUrl.origin))
  // Ciasteczko state jest jednorazowe: kasujemy je przy każdym wyniku.
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/api/google/callback', maxAge: 0 })
  return res
}

export async function GET(req: NextRequest) {
  const session = await getApiUserClient()
  if (!session) return NextResponse.redirect(new URL('/login', req.nextUrl.origin))
  const userId = session.user.id

  const state = req.nextUrl.searchParams.get('state')
  const cookie = req.cookies.get(STATE_COOKIE)?.value
  if (!state || !cookie || cookie !== `${state}.${userId}`) return done(req, 'state_invalid')

  if (req.nextUrl.searchParams.get('error')) {
    return done(req, req.nextUrl.searchParams.get('error') === 'access_denied' ? 'access_denied' : 'error')
  }

  const code = req.nextUrl.searchParams.get('code')
  const config = getConnectConfig()
  if (!config.ok) return done(req, 'config_missing')
  if (!code) return done(req, 'error')

  let tokens
  let info
  try {
    tokens = await exchangeCode(code)
    info = await fetchUserInfo(tokens.accessToken)
  } catch (e) {
    console.error('[google/callback] wymiana kodu nieudana:', e instanceof Error ? e.name : 'błąd')
    return done(req, 'error')
  }

  const revokeAll = async () => {
    // Best effort: nie zostawiamy w Google zgody, której nie zapisaliśmy.
    await revokeToken(tokens.refreshToken ?? tokens.accessToken)
  }

  if (!info.emailVerified || !isAllowed(info.email, config.allowlist)) {
    await revokeAll()
    return done(req, 'not_allowed')
  }
  if (!tokens.scopes.includes(GMAIL_SEND_SCOPE)) {
    await revokeAll()
    return done(req, 'scope_missing')
  }
  if (!tokens.refreshToken) return done(req, 'no_refresh_token')

  try {
    await saveConnection(userId, { refreshToken: tokens.refreshToken, scopes: tokens.scopes }, info.email.toLowerCase())
  } catch (e) {
    console.error('[google/callback] zapis połączenia nieudany:', e instanceof Error ? e.name : 'błąd')
    return done(req, 'error')
  }
  return done(req, 'connected')
}
