import { type NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Punkt wejścia dla linków z e-maili Supabase Auth (reset hasła, zaproszenie,
 * potwierdzenie adresu). Obsługuje oba formaty:
 * - `?token_hash=...&type=recovery` (szablon e-maila z `{{ .TokenHash }}`),
 * - `?code=...` (PKCE — gdy reset zainicjowano z formularza w aplikacji).
 * Po ustanowieniu sesji przekierowuje na `next` (domyślnie /reset-password dla
 * odzyskiwania hasła, / dla pozostałych typów).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = safeNext(
    searchParams.get('next') ?? (type === 'recovery' || code ? '/reset-password' : '/'),
  )

  const supabase = await createClient()
  let ok = false

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  }

  const url = request.nextUrl.clone()
  url.search = ''
  if (ok) {
    url.pathname = next
  } else {
    url.pathname = '/login'
    url.searchParams.set('error', 'link_invalid')
  }
  return NextResponse.redirect(url)
}

/** Przyjmuje tylko ścieżki względne w obrębie aplikacji (bez open redirect). */
function safeNext(next: string) {
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
