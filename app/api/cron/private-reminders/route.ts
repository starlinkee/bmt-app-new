import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendPrivateMonthlyReminder } from '@/lib/email'

export async function POST(request: Request) {
  const cronHeader = request.headers.get('x-vercel-cron')
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  const authorized =
    cronHeader === '1' ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`)

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      .eq('contract_type', 'PRIVATE'),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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

  return NextResponse.json({ sent, skipped })
}
