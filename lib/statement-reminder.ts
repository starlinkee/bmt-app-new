import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { sendStatementUploadReminderEmail } from '@/lib/email'
import { getCurrentDate } from '@/lib/clock'

// Wysyła do administratora przypomnienie o wgraniu wyciągu z banku.
// Wyzwalane 16. dnia miesiąca (cron uderza w endpoint częściej, więc pilnujemy
// tu, żeby faktycznie wysłać tylko raz w danym miesiącu, dokładnie 16. dnia).
export async function processStatementUploadReminder() {
  const now = await getCurrentDate()
  if (now.getDate() !== 16) {
    return { sent: false, reason: 'Not the 16th' }
  }

  const adminEmail = process.env.APP_ADMIN_EMAIL
  if (!adminEmail) {
    return { sent: false, reason: 'APP_ADMIN_EMAIL not configured' }
  }

  const supabase = createServiceClient()
  const dedupKey = `${now.getFullYear()}-${now.getMonth() + 1}`

  // Atomowe "zastrzeżenie" tego miesiąca - unique constraint na (action_name,
  // dedup_key) gwarantuje, że dwa równoległe wywołania nie przejdą oba.
  const { error: claimError } = await supabase
    .from('reminder_dedup')
    .insert({ action_name: 'statementUploadReminder', dedup_key: dedupKey })

  if (claimError) {
    if (claimError.code === '23505') {
      return { sent: false, reason: 'Already sent this month' }
    }
    throw claimError
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
    // Zwolnij zastrzeżenie, żeby kolejna próba mogła wysłać ponownie.
    await supabase
      .from('reminder_dedup')
      .delete()
      .eq('action_name', 'statementUploadReminder')
      .eq('dedup_key', dedupKey)
    await logAudit({
      actionName: 'statementUploadReminder',
      operation: 'CREATE',
      errorData: e,
    })
    throw e
  }
}
