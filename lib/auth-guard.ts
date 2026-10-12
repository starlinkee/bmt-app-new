import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Strażnik server actions: weryfikuje użytkownika przez supabase.auth.getUser()
 * (token sprawdzany w Supabase Auth - getSession() tylko dekoduje ciasteczko).
 * Każda eksportowana akcja w pliku 'use server' wywołuje to jako pierwszą
 * instrukcję (pilnuje tego __tests__/unit/server-actions-auth.test.ts).
 * Plik celowo BEZ 'use server' - nie jest akcją wołaną z przeglądarki.
 */
export async function requireUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Unauthorized')
  return { user: data.user }
}
