import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Strażnik server actions: weryfikuje użytkownika przez supabase.auth.getUser()
 * (token sprawdzany w Supabase Auth - getSession() tylko dekoduje ciasteczko).
 * Każda eksportowana akcja w pliku 'use server' wywołuje requireUser() albo
 * getUserClient() jako pierwszą instrukcję (pilnuje tego
 * __tests__/unit/server-actions-auth.test.ts).
 * Plik celowo BEZ 'use server' - nie jest akcją wołaną z przeglądarki.
 */
async function getVerifiedUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Unauthorized')
  return { user: data.user, supabase }
}

export async function requireUser() {
  const { user } = await getVerifiedUser()
  return { user }
}

/**
 * Jak requireUser(), ale zwraca też klienta Supabase z sesją użytkownika -
 * zapytania przechodzą przez RLS ("owner access"), a inserty dostają
 * owner_id = auth.uid() z DEFAULT kolumny.
 */
export async function getUserClient() {
  return getVerifiedUser()
}

/**
 * Sprawdza przez klienta z sesją (RLS), że najemca należy do zalogowanego konta.
 * Wołać przed użyciem lib/statement, lib/balance itp., które czytają service rolą
 * (omijają RLS). Obcy / nieistniejący tenantId -> 'Not found'.
 */
export async function assertTenantOwned(
  supabase: Awaited<ReturnType<typeof getUserClient>>['supabase'],
  tenantId: number,
) {
  const { data } = await supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle()
  if (!data) throw new Error('Not found')
}
