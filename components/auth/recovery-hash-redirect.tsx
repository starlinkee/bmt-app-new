'use client'

import { useEffect } from 'react'

/**
 * Reset hasła wysłany z panelu Supabase (Authentication → Users → "Send password
 * recovery") używa implicit flow: link ląduje na Site URL z tokenami w hashu
 * (`#access_token=...&type=recovery`). Hash nie trafia na serwer, więc
 * przechwytujemy go w przeglądarce i przenosimy na /reset-password.
 */
export function RecoveryHashRedirect() {
  useEffect(() => {
    const { hash, pathname } = window.location
    if (pathname === '/reset-password' || !hash) return
    const params = new URLSearchParams(hash.slice(1))
    if (params.get('type') === 'recovery' || params.has('error_code')) {
      window.location.replace(`/reset-password${hash}`)
    }
  }, [])

  return null
}
