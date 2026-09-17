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
  meter_reading_reminder_subject?: string | null
  meter_reading_reminder_body?: string | null
}) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('app_config').select('*').eq('id', 1).single()
  const { data: after, error } = await supabase.from('app_config').update(data).eq('id', 1).select().single()
  if (error) {
    await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, afterData: after })
  revalidatePath('/automatyzacje')
}

// Strona jest wyłącznie do odczytu — ta akcja tylko zbiera informacje
// potrzebne do wyświetlenia (kiedy ostatnio coś faktycznie wysłano, na jaki
// adres administratora, jaki szablon). Nic tu nic nie zmienia ani nie wysyła.
export async function getAutomationStatus() {
  const supabase = createServiceClient()

  const [{ data: config }, { data: lastUploadReminder }, { data: lastRentGeneration }, { data: lastMeterReminder }] = await Promise.all([
    supabase
      .from('app_config')
      .select('gmail_user, gmail_user_2, meter_reading_reminder_subject, meter_reading_reminder_body, admin_email')
      .eq('id', 1)
      .single(),
    supabase
      .from('audit_log')
      .select('created_at, after_data')
      .eq('action_name', 'statementUploadReminder')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('audit_log')
      .select('created_at, after_data')
      .eq('action_name', 'generateRents')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('audit_log')
      .select('created_at, after_data')
      .eq('action_name', 'meterReadingReminder')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const lastRentGenerationData = lastRentGeneration?.after_data as
    | { month?: number; year?: number; source?: string; count?: number; skippedCount?: number }
    | null
    | undefined

  const lastMeterReminderData = lastMeterReminder?.after_data as
    | { month?: number; year?: number; count?: number; errors?: unknown[] }
    | null
    | undefined

  return {
    adminEmail: config?.admin_email ?? null,
    gmailUser1: config?.gmail_user ?? null,
    gmailUser2: config?.gmail_user_2 ?? null,
    meterReadingReminderSubject: config?.meter_reading_reminder_subject ?? null,
    lastUploadReminderSentAt: lastUploadReminder?.created_at ?? null,
    lastRentGenerationAt: lastRentGeneration?.created_at ?? null,
    lastRentGenerationInfo: lastRentGenerationData
      ? `${lastRentGenerationData.month}/${lastRentGenerationData.year} — utworzono ${lastRentGenerationData.count ?? 0}, pominięto ${lastRentGenerationData.skippedCount ?? 0} (źródło: ${lastRentGenerationData.source ?? '?'})`
      : null,
    lastMeterReminderSentAt: lastMeterReminder?.created_at ?? null,
    lastMeterReminderInfo: lastMeterReminderData
      ? `${lastMeterReminderData.month}/${lastMeterReminderData.year} — wysłano do ${lastMeterReminderData.count ?? 0} najemców${lastMeterReminderData.errors && lastMeterReminderData.errors.length > 0 ? `, błędy: ${lastMeterReminderData.errors.length}` : ''}`
      : null,
  }
}
