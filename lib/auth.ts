'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Zwraca sesję lub null. */
export async function getSession() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * Dla tras API: zwraca zweryfikowanego użytkownika lub null (bez przekierowania -
 * trasa odpowiada 401). Używa getUser() (weryfikacja tokenu w Supabase Auth);
 * getSession() na serwerze tylko dekoduje ciasteczko, więc przyjęłoby podrobione.
 */
export async function requireApiAuth() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data.user ? null : data.user
}

/** Przekierowuje na /login jeśli brak sesji. */
export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
  return session
}
