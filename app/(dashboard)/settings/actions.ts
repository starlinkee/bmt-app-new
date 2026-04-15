'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

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
  rent_invoice_input_mapping_json?: Record<string, string>
  rent_invoice_pdf_gid?: string
  drive_invoices_folder_id?: string
  reminder_subject?: string
  reminder_body?: string
}) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('app_config')
    .update(data)
    .eq('id', 1)
  if (error) throw error
  revalidatePath('/settings')
}
