'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

/** Przekierowuje na /login jeśli brak zweryfikowanego użytkownika. */
export async function requireAuth() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    redirect('/login')
  }
  return data.user
}
