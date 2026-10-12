'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserClient } from '@/lib/auth-guard'

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
  const { supabase: session } = await getUserClient()
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Nieznana lub niedozwolona tabela: ${table}`)
  }

  const safePageSize = Math.min(500, Math.max(10, Math.floor(pageSize) || 50))
  const safePage = Math.max(1, Math.floor(page) || 1)
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  // Nietypowany klient: nazwa tabeli jest dynamiczna (biała lista wyżej). Klient z sesją -
  // RLS zawęża wiersze do własnego konta.
  const supabase = session as unknown as SupabaseClient
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
