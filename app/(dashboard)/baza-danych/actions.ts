'use server'

import { createClient } from '@supabase/supabase-js'

/**
 * Ten ekran pokazuje DOWOLNĄ tabelę 1-1 tak, jak wygląda w bazie, więc
 * celowo nie używamy typowanego klienta (types/supabase.ts) — ograniczałby
 * nas do znanych z góry tabel/kolumn. Zamiast tego autoryzację i zakres
 * dostępu pilnuje biała lista ALLOWED_TABLES poniżej.
 */
function createRawServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Biała lista tabel, które można przeglądać. Trzymana po stronie serwera,
// żeby nazwa tabeli przekazana z klienta nigdy nie trafiła do zapytania
// bez weryfikacji.
const ALLOWED_TABLES = new Set([
  'tenants',
  'properties',
  'contracts',
  'invoices',
  'transactions',
  'transaction_staging',
  'transaction_amendments',
  'settlement_groups',
  'settlement_group_properties',
  'media_settlements',
  'media_meter_readings',
  'app_config',
  'profiles',
  'operation_log',
  'audit_log',
  'email_logs',
  'skill_prompts',
])

export type DbTableRowsResult = {
  rows: Record<string, unknown>[]
  columns: string[]
  total: number
  page: number
  pageSize: number
}

export async function getDbTableRows(
  table: string,
  page: number,
  pageSize: number,
): Promise<DbTableRowsResult> {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Nieznana lub niedozwolona tabela: ${table}`)
  }

  const safePageSize = Math.min(500, Math.max(10, Math.floor(pageSize) || 50))
  const safePage = Math.max(1, Math.floor(page) || 1)
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  const supabase = createRawServiceClient()
  const { data, error, count } = await supabase
    .from(table)
    .select('*', { count: 'exact' })
    .order('id', { ascending: true })
    .range(from, to)

  if (error) throw error

  const rows = (data ?? []) as Record<string, unknown>[]
  // Kolejność kolumn bierzemy z pierwszego zwróconego wiersza — Postgrest
  // zwraca dla select('*') wszystkie kolumny (nawet null), w kolejności
  // zdefiniowanej w tabeli, więc to odzwierciedla realny układ w bazie.
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  return {
    rows,
    columns,
    total: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  }
}
