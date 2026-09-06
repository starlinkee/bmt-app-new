'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import type { Json } from '@/types/supabase'

export async function getAppConfig() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 1)
    .single()
  return data
}

export async function upsertAppConfig(data: {
  rent_invoice_spreadsheet_id?: string
  rent_invoice_input_mapping_json?: Json
  rent_invoice_pdf_gid?: string
  drive_invoices_folder_id?: string
  reminder_subject?: string
  reminder_body?: string
  late_reminder_subject?: string
  late_reminder_body?: string
  rent_email_subject?: string | null
  rent_email_body?: string | null
  email_provider?: string
  gmail_user?: string | null
  gmail_app_password?: string | null
  email_provider_2?: string
  gmail_user_2?: string | null
  gmail_app_password_2?: string | null
}) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('app_config').select('*').eq('id', 1).single()
  const { data: after, error } = await supabase.from('app_config').update(data).eq('id', 1).select().single()
  if (error) {
    await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, afterData: after })
  revalidatePath('/ustawienia')
}
