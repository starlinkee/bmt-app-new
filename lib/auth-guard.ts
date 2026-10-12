import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Strażnik server actions: weryfikuje użytkownika przez supabase.auth.getClaims()
 * (podpis i ważność JWT - getSession() tylko dekoduje ciasteczko).
 * Każda eksportowana akcja w pliku 'use server' wywołuje requireUser() albo
 * getUserClient() jako pierwszą instrukcję (pilnuje tego
 * __tests__/unit/server-actions-auth.test.ts).
 * Plik celowo BEZ 'use server' - nie jest akcją wołaną z przeglądarki.
 */
// Jedna weryfikacja na żądanie serwera (React cache): getClaims() sprawdza podpis i
// ważność JWT (przy kluczach asymetrycznych lokalnie, bez zapytania do Supabase Auth),
// a wynik jest współdzielony przez requireUser/getUserClient/requireAuth/requireApiAuth
// i layout w tym samym żądaniu. Kompromis: sesja unieważniona gdzie indziej (wylogowanie)
// działa do wygaśnięcia tokenu (domyślnie <= 1 h) - to zalecany przez Supabase wzorzec
// ochrony po stronie serwera. getSession() NIE jest weryfikacją (tylko dekoduje ciasteczko).
const verifiedSession = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  const user = { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined }
  return { user, supabase }
})

/** Zweryfikowany użytkownik albo null (dla tras API i requireAuth, które nie rzucają). */
export async function getVerifiedUserOrNull() {
  return (await verifiedSession())?.user ?? null
}

async function getVerifiedUser() {
  const session = await verifiedSession()
  if (!session) throw new Error('Unauthorized')
  return session
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
