/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { assertNotProduction } from './guard'

// Współdzielone przez testy Playwright (e2e/) i vitestowe testy integracyjne
// (__tests__/integration/) - jedna implementacja klienta bazy i sprzątania.

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
// rekordy założone przez testy e2e/integracyjne, żeby nigdy nie pomylić ich z
// prawdziwymi danymi.
export const E2E_PREFIX = 'E2E_TEST__'

export type Db = ReturnType<typeof createTestDbClient>

/**
 * Ten sam klient bez typów tabel. `types/supabase.ts` nie zna jeszcze kolumn
 * dodanych późnymi migracjami (np. `import_id` w transactions/transaction_staging
 * - aplikacja też obchodzi to przez `as any`), więc zapytania o nie idą tędy.
 */
export function loose(db: Db): SupabaseClient<any> {
  return db as unknown as SupabaseClient<any>
}

function must<T extends { error: { message: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`Sprzątanie testów (${what}) nie powiodło się: ${res.error.message}`)
  return res
}

// Funkcje sprzątające poniżej celowo RZUCAJĄ błąd, jeśli usunięcie się nie uda
// (np. przez FK `on delete restrict`) - dzięki temu śmieci w bazie preview nie
// zostają po cichu, tylko test od razu to zgłasza. Kolejność usuwania jest
// dobrana pod FK: transakcje/faktury/umowy -> najemcy -> nieruchomości / grupy.

/**
 * DELETE z `transactions` i `invoices` jest domyślnie blokowany triggerem
 * (patrz migracja 20260911140000_configurable_delete_protection.sql) - włącza
 * go dopiero `app_config.allow_destructive_test_deletes`. Na czas sprzątania
 * włączamy flagę i przywracamy ją do poprzedniej wartości. Odmawia, jeśli
 * cel to projekt produkcyjny z PRODUCTION_SUPABASE_REFS.
 */
async function withDestructiveDeletes<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  assertNotProduction()
  const { data } = must(
    await db.from('app_config').select('allow_destructive_test_deletes').eq('id', 1).single(),
    'app_config lookup',
  )
  if (data?.allow_destructive_test_deletes) return fn()

  must(await db.from('app_config').update({ allow_destructive_test_deletes: true }).eq('id', 1), 'app_config unlock')
  try {
    return await fn()
  } finally {
    must(await db.from('app_config').update({ allow_destructive_test_deletes: false }).eq('id', 1), 'app_config relock')
  }
}

// Flagę przełączamy tylko wtedy, gdy faktycznie jest co kasować - dzięki temu
// równoległe workery e2e, które nie mają faktur/transakcji, w ogóle jej nie ruszają.
async function deleteProtectedRows(
  db: Db,
  table: 'invoices' | 'transactions',
  column: string,
  ids: (number | string)[],
  what: string,
) {
  if (!ids.length) return
  const { data } = must(await db.from(table).select('id').in(column as 'id', ids as number[]).limit(1), `${what} lookup`)
  if (!data?.length) return
  await withDestructiveDeletes(db, async () => {
    must(await db.from(table).delete().in(column as 'id', ids as number[]), what)
  })
}

export async function deleteTenants(db: Db, tenantIds: number[]) {
  if (!tenantIds.length) return
  await deleteProtectedRows(db, 'transactions', 'tenant_id', tenantIds, 'transactions')
  must(await db.from('transaction_staging').delete().in('suggested_tenant_id', tenantIds), 'transaction_staging')
  await deleteProtectedRows(db, 'invoices', 'tenant_id', tenantIds, 'invoices')
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
  const { data: settlements } = must(
    await db.from('media_settlements').select('id').in('group_id', groupIds),
    'media_settlements lookup',
  )
  // Faktury wygenerowane przez rozliczenie (FK set null, ale to nasze śmieci).
  await deleteProtectedRows(db, 'invoices', 'media_settlement_id', (settlements ?? []).map((s) => s.id), 'invoices (media)')
  must(await db.from('media_settlements').delete().in('group_id', groupIds), 'media_settlements')
  must(await db.from('settlement_groups').delete().in('id', groupIds), 'settlement_groups')
}

export type PurgeOptions = {
  /**
   * ISO timestamp startu przebiegu. Gdy podany, kasujemy też wpisy `audit_log`
   * utworzone od tej chwili przez akcje, które testy integracyjne wywołują
   * (logAudit nie zostawia w nich żadnego prefiksu, po którym dałoby się je poznać).
   */
  auditSince?: string
}

// Akcje zapisujące do audit_log, które wywołują testy integracyjne.
const TEST_AUDIT_ACTIONS = [
  'importBankStatement',
  'reconcileTransaction',
  'dismissTransaction',
  'dismissAllTransactions',
  'updateTransactionCategory',
  'processSettlement',
  'generateRents',
]

/** Usuwa wszystko, co ma prefiks E2E_TEST__ (siatka bezpieczeństwa po całym przebiegu). */
export async function purgeAllTestData(db: Db, options: PurgeOptions = {}) {
  const like = `${E2E_PREFIX}%`

  // Importy założone przez testy rozpoznajemy po ich rekordach podrzędnych,
  // zanim je usuniemy (wiersz audit_log samego importu nie ma prefiksu, a przy
  // nieudanym imporcie nawet after_data).
  const importIds = new Set<number>()
  for (const table of ['transactions', 'transaction_staging'] as const) {
    const { data } = must(
      await loose(db).from(table).select('import_id').like('title', like).not('import_id', 'is', null),
      `${table} import lookup`,
    )
    for (const row of (data ?? []) as { import_id: number | null }[]) if (row.import_id != null) importIds.add(row.import_id)
  }

  const { data: tenants } = must(await db.from('tenants').select('id').like('last_name', like), 'tenants lookup')
  await deleteTenants(db, (tenants ?? []).map((t) => t.id))

  // Wiersze bez najemcy (odrzucone / czekające w kolejce importu).
  must(await db.from('transaction_staging').delete().like('title', like), 'transaction_staging')
  const { data: orphanTx } = must(await db.from('transactions').select('id').like('title', like), 'transactions lookup')
  await deleteProtectedRows(db, 'transactions', 'id', (orphanTx ?? []).map((t) => t.id), 'transactions (bez najemcy)')

  const { data: groups } = must(await db.from('settlement_groups').select('id').like('name', like), 'groups lookup')
  await deleteSettlementGroups(db, (groups ?? []).map((g) => g.id))
  const { data: props } = must(await db.from('properties').select('id').like('name', like), 'properties lookup')
  await deleteProperties(db, (props ?? []).map((p) => p.id))

  // Logi e-mail (adresy testowe zawierają e2e_test__) i audyt.
  must(await db.from('email_logs').delete().ilike('to_email', `%${E2E_PREFIX.toLowerCase()}%`), 'email_logs')
  if (importIds.size) must(await db.from('audit_log').delete().in('id', [...importIds]), 'audit_log (importy)')
  if (options.auditSince) {
    must(
      await db.from('audit_log').delete().gte('created_at', options.auditSince).in('action_name', TEST_AUDIT_ACTIONS),
      'audit_log',
    )
  }
}

/** Liczba rekordów z prefiksem testowym per tabela - po udanym sprzątaniu wszędzie 0. */
export async function countTestLeftovers(db: Db): Promise<Record<string, number>> {
  const like = `${E2E_PREFIX}%`
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string) =>
    [what, must(await q, what).count ?? 0] as const

  const head = { count: 'exact', head: true } as const
  const entries = await Promise.all([
    count(db.from('tenants').select('*', head).like('last_name', like), 'tenants'),
    count(db.from('properties').select('*', head).like('name', like), 'properties'),
    count(db.from('settlement_groups').select('*', head).like('name', like), 'settlement_groups'),
    count(db.from('transactions').select('*', head).like('title', like), 'transactions'),
    count(db.from('transaction_staging').select('*', head).like('title', like), 'transaction_staging'),
    count(db.from('email_logs').select('*', head).ilike('to_email', `%${E2E_PREFIX.toLowerCase()}%`), 'email_logs'),
  ])
  return Object.fromEntries(entries)
}
