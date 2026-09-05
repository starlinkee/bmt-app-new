import { createServiceClient } from '@/lib/supabase/service'
import { getTenantsWithBalances } from '@/app/(dashboard)/kontrola-platnosci/actions'
import { sendStatementToTenant } from '@/app/(dashboard)/kontrola-platnosci/actions'
import { logAudit } from '@/lib/audit'

export async function processLateReminders() {
  const now = new Date()
  if (now.getDate() <= 10) {
    return { sent: 0, skipped: 0, reason: 'Before 11th' }
  }

  const supabase = createServiceClient()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const tenants = await getTenantsWithBalances()
  const debtors = tenants.filter((t) => t.balance < 0)

  let sent = 0
  let skipped = 0

  for (const tenant of debtors) {
    // Sprawdz czy juz wyslalismy ponaglenie w tym miesiacu
    const { data: existingLogs } = await supabase
      .from('audit_log')
      .select('id')
      .eq('action_name', 'lateReminder')
      .eq('record_id', String(tenant.id))
      .gte('created_at', startOfMonth)
      .limit(1)

    if (existingLogs && existingLogs.length > 0) {
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
      console.error('Failed to send late reminder to tenant', tenant.id, e)
      skipped++
    }
  }

  return { sent, skipped }
}
