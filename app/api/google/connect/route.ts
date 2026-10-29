import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getApiUserClient } from '@/lib/auth-guard'
import { STATE_COOKIE, buildAuthUrl, getConnectConfig } from '@/lib/google-oauth'

const STATE_TTL_SECONDS = 600

// Start łączenia konta z Google: losowy state w ciasteczku HttpOnly (powiązany z kontem) i przekierowanie do Google.
export async function GET(req: NextRequest) {
  const session = await getApiUserClient()
  if (!session) return NextResponse.redirect(new URL('/login', req.nextUrl.origin))

  if (!getConnectConfig().ok) return NextResponse.redirect(new URL('/ustawienia?google=config_missing', req.nextUrl.origin))

  const state = randomBytes(32).toString('base64url')
  const res = NextResponse.redirect(buildAuthUrl(state))
  res.cookies.set(STATE_COOKIE, `${state}.${session.user.id}`, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/api/google/callback',
    maxAge: STATE_TTL_SECONDS,
  })
  return res
}
