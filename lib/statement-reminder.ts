import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { sendStatementUploadReminderEmail } from '@/lib/email'

// Wysyła do administratora przypomnienie o wgraniu wyciągu z banku.
// Wyzwalane 16. dnia miesiąca (cron uderza w endpoint częściej, więc pilnujemy
// tu, żeby faktycznie wysłać tylko raz w danym miesiącu, dokładnie 16. dnia).
export async function processStatementUploadReminder() {
  const now = new Date()
  if (now.getDate() !== 16) {
    return { sent: false, reason: 'Not the 16th' }
  }

  const adminEmail = process.env.APP_ADMIN_EMAIL
  if (!adminEmail) {
    return { sent: false, reason: 'APP_ADMIN_EMAIL not configured' }
  }

  const supabase = createServiceClient()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: existingLogs } = await supabase
    .from('audit_log')
    .select('id')
    .eq('action_name', 'statementUploadReminder')
    .gte('created_at', startOfMonth)
    .limit(1)

  if (existingLogs && existingLogs.length > 0) {
    return { sent: false, reason: 'Already sent this month' }
  }

  try {
    await sendStatementUploadReminderEmail(adminEmail)
    await logAudit({
      actionName: 'statementUploadReminder',
      operation: 'CREATE',
      afterData: { to: adminEmail },
    })
    return { sent: true }
  } catch (e) {
    await logAudit({
      actionName: 'statementUploadReminder',
      operation: 'CREATE',
      errorData: e,
    })
    throw e
  }
}
