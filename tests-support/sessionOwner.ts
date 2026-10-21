/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'

// Po slice 4b `current_owner_id()` = `auth.uid()`: insert service rolą bez `owner_id` pada (NOT NULL).
// Kod produkcyjny zapisuje wtedy klientem sesji, gdzie DEFAULT = auth.uid(). Testy integracyjne nie mają
// sesji, więc ten wrapper odwzorowuje DEFAULT: uzupełnia brakujący `owner_id` id testowego użytkownika.

export const OWNER_TABLES = new Set([
  'properties', 'tenants', 'contracts', 'invoices', 'transactions', 'transaction_staging',
  'transaction_amendments', 'settlement_groups', 'settlement_group_properties', 'media_settlements',
  'media_meter_readings', 'operation_log', 'audit_log', 'email_logs', 'reminder_dedup', 'skill_prompts',
  'app_config',
])

/** Zmienna ustawiana w setup.ts testów integracyjnych: id konta, w imieniu którego "działa sesja". */
export const TEST_SESSION_OWNER_ENV = 'TEST_SESSION_OWNER_ID'

function fill(values: any, ownerId: string): any {
  const one = (row: any) => (row && typeof row === 'object' && !('owner_id' in row) ? { ...row, owner_id: ownerId } : row)
  return Array.isArray(values) ? values.map(one) : one(values)
}

export function withSessionOwner<T extends SupabaseClient<any, any, any>>(client: T, ownerId: string): T {
  const originalFrom = client.from.bind(client)
  ;(client as any).from = (table: string) => {
    const builder: any = originalFrom(table)
    if (!OWNER_TABLES.has(table)) return builder
    for (const method of ['insert', 'upsert'] as const) {
      const original = builder[method].bind(builder)
      builder[method] = (values: unknown, ...rest: unknown[]) => original(fill(values, ownerId), ...rest)
    }
    return builder
  }
  return client
}
