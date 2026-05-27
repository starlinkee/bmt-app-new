'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { sendPrivateMonthlyReminder } from '@/lib/email'

type ContractType = 'PRIVATE' | 'BMT'

export type OperationKey = 'reminders_private' | 'reminders_bmt'

export type OperationLogEntry = {
  id: number
  operation: string
  called_at: string
  success: boolean
  sent: number | null
  skipped: number | null
  error: string | null
  failed: { email: string; error: string }[] | null
}

export async function getOperationHistory(limit = 50): Promise<OperationLogEntry[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('operation_log')
    .select('id, operation, called_at, result')
    .in('operation', ['reminders_private', 'reminders_bmt'])
    .order('called_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => {
    const r = row.result as Record<string, unknown> | null
    const hasFailed = Array.isArray(r?.failed) && (r!.failed as unknown[]).length > 0
    const hasError = typeof r?.error === 'string'
    return {
      id: row.id,
      operation: row.operation,
      called_at: row.called_at,
      success: !hasError && !hasFailed,
      sent: typeof r?.sent === 'number' ? r.sent : null,
      skipped: typeof r?.skipped === 'number' ? r.skipped : null,
      error: hasError ? (r!.error as string) : null,
      failed: hasFailed ? (r!.failed as { email: string; error: string }[]) : null,
    }
  })
}

export async function getLastOperationTimes(): Promise<Record<OperationKey, string | null>> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('operation_log')
    .select('operation, called_at')
    .in('operation', ['reminders_private', 'reminders_bmt'])
    .order('called_at', { ascending: false })

  const result: Record<OperationKey, string | null> = {
    reminders_private: null,
    reminders_bmt: null,
  }
  for (const row of data ?? []) {
    const key = row.operation as OperationKey
    if (result[key] === null) result[key] = row.called_at
  }
  return result
}

export async function sendReminders(contractType: ContractType): Promise<{ sent: number; skipped: number }> {
  const supabase = createServiceClient()
  const now = new Date()

  const [{ data: config }, { data: contracts, error }] = await Promise.all([
    supabase
      .from('app_config')
      .select('reminder_subject, reminder_body')
      .eq('id', 1)
      .single(),
    supabase
      .from('contracts')
      .select('id, rent_amount, tenants(first_name, last_name, email, email2)')
      .eq('is_active', true)
      .eq('contract_type', contractType),
  ])

  if (error) {
    await supabase.from('operation_log').insert({
      operation: `reminders_${contractType.toLowerCase()}`,
      result: { error: error.message },
    })
    throw new Error(error.message)
  }

  const subjectTemplate = config?.reminder_subject ?? 'Przypomnienie o płatności czynszu {miesiac}/{rok}'
  const bodyTemplate = config?.reminder_body ?? 'Szanowny/a {imie},\n\nPrzypominamy o płatności czynszu za {miesiac}/{rok} w kwocie {kwota} zł.\n\nPozdrawiamy,\nBMT'

  let sent = 0
  let skipped = 0
  const failed: { email: string; error: string }[] = []

  for (const contract of contracts ?? []) {
    const tenant = contract.tenants as unknown as {
      first_name: string
      last_name: string
      email: string | null
      email2: string | null
    }

    if (!tenant?.email) {
      skipped++
      continue
    }

    const recipients = [tenant.email, tenant.email2].filter(Boolean) as string[]

    try {
      await sendPrivateMonthlyReminder(
        recipients,
        `${tenant.first_name} ${tenant.last_name}`,
        now.getMonth() + 1,
        now.getFullYear(),
        Number(contract.rent_amount),
        subjectTemplate,
        bodyTemplate,
      )

      await supabase
        .from('contracts')
        .update({ reminder_last_sent_at: now.toISOString() })
        .eq('id', contract.id)

      sent++
    } catch (e) {
      failed.push({
        email: tenant.email,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  await supabase.from('operation_log').insert({
    operation: `reminders_${contractType.toLowerCase()}`,
    result: failed.length > 0 ? { sent, skipped, failed } : { sent, skipped },
  })

  if (failed.length > 0) {
    throw new Error(`Nie udało się wysłać do: ${failed.map((f) => f.email).join(', ')}`)
  }

  return { sent, skipped }
}
