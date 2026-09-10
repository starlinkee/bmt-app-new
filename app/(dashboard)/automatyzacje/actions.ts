'use server'

import { createServiceClient } from '@/lib/supabase/service'

// Strona jest wyłącznie do odczytu — ta akcja tylko zbiera informacje
// potrzebne do wyświetlenia (kiedy ostatnio coś faktycznie wysłano, na jaki
// adres administratora, jaki szablon). Nic tu nic nie zmienia ani nie wysyła.
export async function getAutomationStatus() {
  const supabase = createServiceClient()

  const [{ data: config }, { data: lastUploadReminder }, { data: lastLateReminder }] = await Promise.all([
    supabase
      .from('app_config')
      .select('gmail_user, gmail_user_2, late_reminder_subject, late_reminder_body')
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
  ])

  return {
    adminEmail: process.env.APP_ADMIN_EMAIL ?? null,
    gmailUser1: config?.gmail_user ?? null,
    gmailUser2: config?.gmail_user_2 ?? null,
    lateReminderSubject: config?.late_reminder_subject ?? null,
    lateReminderBody: config?.late_reminder_body ?? null,
    lastUploadReminderSentAt: lastUploadReminder?.created_at ?? null,
    lastLateReminderSentAt: lastLateReminder?.created_at ?? null,
  }
}
