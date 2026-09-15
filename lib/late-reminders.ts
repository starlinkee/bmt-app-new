import { createServiceClient } from '@/lib/supabase/service'
import { getTenantsWithBalances } from '@/app/(dashboard)/kontrola-platnosci/actions'
import { sendStatementToTenant } from '@/app/(dashboard)/kontrola-platnosci/actions'
import { logAudit } from '@/lib/audit'
import { getCurrentDate } from '@/lib/clock'

export async function processLateReminders() {
  const now = await getCurrentDate()
  if (now.getDate() <= 14) {
    return { sent: 0, skipped: 0, reason: 'Before 15th' }
  }

  const supabase = createServiceClient()
  const dedupKeySuffix = `${now.getFullYear()}-${now.getMonth() + 1}`

  const tenants = await getTenantsWithBalances()
  const debtors = tenants.filter((t) => t.balance < 0)

  let sent = 0
  let skipped = 0

  for (const tenant of debtors) {
    const dedupKey = `${tenant.id}-${dedupKeySuffix}`

    // Atomowe "zastrzeżenie" tego najemcy na ten miesiąc - unique constraint
    // na (action_name, dedup_key) gwarantuje, że dwa równoległe wywołania
    // (np. cron trafiony dwa razy blisko siebie) nie wyślą obu maili.
    const { error: claimError } = await supabase
      .from('reminder_dedup')
      .insert({ action_name: 'lateReminder', dedup_key: dedupKey })

    if (claimError) {
      if (claimError.code === '23505') {
        skipped++
        continue
      }
      console.error('Failed to claim late reminder dedup for tenant', tenant.id, claimError)
      skipped++
      continue
    }

    try {
      await sendStatementToTenant(tenant.id)
      await logAudit({
        actionName: 'lateReminder',
        tableName: 'tenants',
        operation: 'UPDATE',
        recordId: tenant.id,
        afterData: { balance: tenant.balance }
      })
      sent++
    } catch (e) {
      // Zwolnij zastrzeżenie, żeby kolejny cron mógł spróbować ponownie.
      await supabase
        .from('reminder_dedup')
        .delete()
        .eq('action_name', 'lateReminder')
        .eq('dedup_key', dedupKey)
      console.error('Failed to send late reminder to tenant', tenant.id, e)
      skipped++
    }
  }

  return { sent, skipped }
}
