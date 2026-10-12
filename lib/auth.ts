'use server'

import { redirect } from 'next/navigation'
import { getVerifiedUserOrNull } from '@/lib/auth-guard'

/**
 * Dla tras API: zwraca zweryfikowanego użytkownika lub null (bez przekierowania -
 * trasa odpowiada 401). Weryfikacja (getClaims, jedna na żądanie) żyje w
 * lib/auth-guard.ts; getSession() na serwerze tylko dekoduje ciasteczko, więc
 * przyjęłoby podrobione.
 */
export async function requireApiAuth() {
  return getVerifiedUserOrNull()
}

/** Przekierowuje na /login jeśli brak zweryfikowanego użytkownika. */
export async function requireAuth() {
  const user = await getVerifiedUserOrNull()
  if (!user) redirect('/login')
  return user
}
