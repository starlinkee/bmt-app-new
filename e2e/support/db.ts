import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Klient service_role wskazujący na bazę Supabase środowiska preview —
 * używany WYŁĄCZNIE do zakładania i sprzątania danych testowych z poziomu
 * testów (poza UI), żeby nie zależeć od kolejności innych scenariuszy.
 */
export function createTestDbClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY dla preview — ustaw je w .env.e2e.',
    )
  }
  return createClient<Database>(url, key)
}

// Prefiks pozwalający jednoznacznie rozpoznać (i w razie czego posprzątać ręcznie)
// rekordy założone przez testy e2e, żeby nigdy nie pomylić ich z prawdziwymi danymi.
export const E2E_PREFIX = 'E2E_TEST__'

type Db = ReturnType<typeof createTestDbClient>

function must<T extends { error: { message: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`Sprzątanie e2e (${what}) nie powiodło się: ${res.error.message}`)
  return res
}

// Funkcje sprzątające poniżej celowo RZUCAJĄ błąd, jeśli usunięcie się nie uda
// (np. przez FK `on delete restrict`) - dzięki temu śmieci w bazie preview nie
// zostają po cichu, tylko test od razu to zgłasza. Kolejność usuwania jest
// dobrana pod FK: faktury/umowy -> najemcy -> nieruchomości / grupy.

export async function deleteTenants(db: Db, tenantIds: number[]) {
  if (!tenantIds.length) return
  must(await db.from('invoices').delete().in('tenant_id', tenantIds), 'invoices')
  must(await db.from('contracts').delete().in('tenant_id', tenantIds), 'contracts')
  must(await db.from('tenants').delete().in('id', tenantIds), 'tenants')
}

export async function deleteProperties(db: Db, propertyIds: number[]) {
  if (!propertyIds.length) return
  // Najemcy (także założeni przez UI) blokują usunięcie nieruchomości (restrict).
  const { data } = must(await db.from('tenants').select('id').in('property_id', propertyIds), 'tenants lookup')
  await deleteTenants(db, (data ?? []).map((t) => t.id))
  must(await db.from('properties').delete().in('id', propertyIds), 'properties')
}

export async function deleteSettlementGroups(db: Db, groupIds: number[]) {
  if (!groupIds.length) return
  must(await db.from('media_settlements').delete().in('group_id', groupIds), 'media_settlements')
  must(await db.from('settlement_groups').delete().in('id', groupIds), 'settlement_groups')
}

/** Usuwa wszystko, co ma prefiks E2E_TEST__ (siatka bezpieczeństwa po całym przebiegu). */
export async function purgeAllTestData(db: Db) {
  const like = `${E2E_PREFIX}%`
  const { data: tenants } = must(await db.from('tenants').select('id').like('last_name', like), 'tenants lookup')
  await deleteTenants(db, (tenants ?? []).map((t) => t.id))
  const { data: groups } = must(await db.from('settlement_groups').select('id').like('name', like), 'groups lookup')
  await deleteSettlementGroups(db, (groups ?? []).map((g) => g.id))
  const { data: props } = must(await db.from('properties').select('id').like('name', like), 'properties lookup')
  await deleteProperties(db, (props ?? []).map((p) => p.id))
}
