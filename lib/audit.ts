import { createServiceClient } from '@/lib/supabase/service'
import type { Json } from '@/types/supabase'

export type AuditOperation = 'CREATE' | 'UPDATE' | 'DELETE' | 'UPSERT' | 'IMPORT' | 'DISMISS'

interface AuditEntry {
  actionName: string
  tableName?: string
  operation: AuditOperation
  recordId?: string | number | null
  beforeData?: unknown
  afterData?: unknown
  errorData?: unknown
  // Właściciel wpisu (konto, które wykonało akcję). Bez niego wiersz dostaje
  // domyślnego właściciela legacy (service role) - do domknięcia w kolejnych slice'ach.
  ownerId?: string
}

function serializeError(err: unknown): Record<string, unknown> | null {
  if (err === undefined || err === null) return null
  if (typeof err === 'string') return { message: err }
  if (err instanceof Error) return { message: err.message }
  if (typeof err === 'object' && 'message' in err) return err as Record<string, unknown>
  return { raw: String(err) }
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('audit_log').insert({
      action_name: entry.actionName,
      table_name:  entry.tableName ?? null,
      operation:   entry.operation,
      record_id:   entry.recordId != null ? String(entry.recordId) : null,
      before_data: (entry.beforeData !== undefined ? entry.beforeData : null) as Json,
      after_data:  (entry.afterData  !== undefined ? entry.afterData  : null) as Json,
      error_data:  (entry.errorData  !== undefined ? serializeError(entry.errorData) : null) as Json,
      ...(entry.ownerId ? { owner_id: entry.ownerId } : {}),
    })
  } catch {
    // logAudit nigdy nie rzuca - nie może zepsuć głównej operacji
  }
}
