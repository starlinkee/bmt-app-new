'use server'

import { createServiceClient } from '@/lib/supabase/service'

// Strona jest wyłącznie do odczytu — ta akcja tylko zbiera informacje
// potrzebne do wyświetlenia (kiedy ostatnio coś faktycznie wysłano, na jaki
// adres administratora, jaki szablon). Nic tu nic nie zmienia ani nie wysyła.
export async function getAutomationStatus() {
  const supabase = createServiceClient()

  const [{ data: config }, { data: lastUploadReminder }, { data: lastLateReminder }, { data: lastRentGeneration }, { data: lastMeterReminder }] = await Promise.all([
    supabase
      .from('app_config')
      .select('gmail_user, gmail_user_2, late_reminder_subject, late_reminder_body, meter_reading_reminder_subject, meter_reading_reminder_body')
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
      .select('created_at')
      .eq('action_name', 'lateReminder')
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
    adminEmail: process.env.APP_ADMIN_EMAIL ?? null,
    gmailUser1: config?.gmail_user ?? null,
    gmailUser2: config?.gmail_user_2 ?? null,
    lateReminderSubject: config?.late_reminder_subject ?? null,
    lateReminderBody: config?.late_reminder_body ?? null,
    meterReadingReminderSubject: config?.meter_reading_reminder_subject ?? null,
    lastUploadReminderSentAt: lastUploadReminder?.created_at ?? null,
    lastLateReminderSentAt: lastLateReminder?.created_at ?? null,
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
