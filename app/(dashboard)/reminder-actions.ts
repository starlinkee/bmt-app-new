'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { sendPrivateMonthlyReminder } from '@/lib/email'

type ContractType = 'PRIVATE' | 'BMT'

export type OperationKey = 'reminders_private' | 'reminders_bmt'

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
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [{ data: config }, { data: contracts, error }] = await Promise.all([
    supabase
      .from('app_config')
      .select('reminder_subject, reminder_body')
      .eq('id', 1)
      .single(),
    supabase
      .from('contracts')
      .select('id, rent_amount, reminder_last_sent_at, tenants(first_name, last_name, email)')
      .eq('is_active', true)
      .eq('contract_type', contractType),
  ])

  if (error) throw new Error(error.message)

  const subjectTemplate = config?.reminder_subject ?? 'Przypomnienie o płatności czynszu {miesiac}/{rok}'
  const bodyTemplate = config?.reminder_body ?? 'Szanowny/a {imie},\n\nPrzypominamy o płatności czynszu za {miesiac}/{rok} w kwocie {kwota} zł.\n\nPozdrawiamy,\nBMT'

  let sent = 0
  let skipped = 0

  for (const contract of contracts ?? []) {
    if (contract.reminder_last_sent_at && contract.reminder_last_sent_at >= startOfMonth) {
      skipped++
      continue
    }

    const tenant = contract.tenants as unknown as {
      first_name: string
      last_name: string
      email: string | null
    }

    if (!tenant?.email) {
      skipped++
      continue
    }

    await sendPrivateMonthlyReminder(
      tenant.email,
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
  }

  await supabase.from('operation_log').insert({
    operation: `reminders_${contractType.toLowerCase()}`,
    result: { sent, skipped },
  })

  return { sent, skipped }
}
