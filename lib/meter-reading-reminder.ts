import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { sendMeterReadingReminderEmail } from '@/lib/email'
import { getCurrentDate } from '@/lib/clock'

// Domyślny komunikat na formularzu najemcy (/odczyty/[token]), gdy okno
// podawania odczytów jest zamknięte. Celowo bez konkretnych dat — nie
// ujawniamy najemcy dokładnego zakresu, w którym formularz jest aktywny.
export const DEFAULT_METER_READING_CLOSED_MESSAGE =
  'Podawanie odczytów jest teraz zamknięte. Sprawdź ponownie pod koniec miesiąca.'

export type EligibleMeterReminderTenant = {
  id: number
  name: string
  emails: string[]
}

// Najemcy, którzy DZIŚ (gdyby przypomnienie wysyłało się teraz) dostaliby maila:
// mają aktywną umowę z włączonymi mediami, adres e-mail, i co najmniej jeden
// klucz odczytu do podania (tenant_reading_keys w grupie rozliczeniowej ich
// nieruchomości). Współdzielone przez cron (processMeterReadingReminder) i
// podgląd w zakładce Automatyzacje.
export async function getEligibleMeterReminderTenants(): Promise<EligibleMeterReminderTenant[]> {
  const supabase = createServiceClient()

  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, first_name, last_name, email, email2, property_id, contracts(is_active, has_media_invoice)')

  if (tenantsError) throw tenantsError

  const eligibleTenants = (tenants ?? []).filter(
    (t) => t.email && t.contracts?.some((c) => c.is_active && c.has_media_invoice),
  )

  const propertyIds = Array.from(
    new Set(eligibleTenants.map((t) => t.property_id).filter((id): id is number => id != null)),
  )

  const readingKeysCountByTenant: Record<number, number> = {}
  if (propertyIds.length > 0) {
    const { data: sgp } = await supabase
      .from('settlement_group_properties')
      .select('property_id, settlement_group_id')
      .in('property_id', propertyIds)

    const groupIds = Array.from(new Set((sgp ?? []).map((s) => s.settlement_group_id)))

    if (groupIds.length > 0) {
      const { data: groups } = await supabase
        .from('settlement_groups')
        .select('id, tenant_reading_keys')
        .in('id', groupIds)

      const readingKeysByGroup = new Map(
        (groups ?? []).map((g) => [g.id, g.tenant_reading_keys as Record<string, unknown[]> | null]),
      )
      const groupIdsByProperty = new Map<number, number[]>()
      for (const row of sgp ?? []) {
        const list = groupIdsByProperty.get(row.property_id) ?? []
        list.push(row.settlement_group_id)
        groupIdsByProperty.set(row.property_id, list)
      }

      for (const t of eligibleTenants) {
        if (t.property_id == null) continue
        let count = 0
        for (const gid of groupIdsByProperty.get(t.property_id) ?? []) {
          const keys = readingKeysByGroup.get(gid)?.[t.id.toString()]
          if (Array.isArray(keys)) count += keys.length
        }
        readingKeysCountByTenant[t.id] = count
      }
    }
  }

  return eligibleTenants
    .filter((t) => (readingKeysCountByTenant[t.id] ?? 0) > 0)
    .map((t) => ({
      id: t.id,
      name: `${t.first_name} ${t.last_name}`.trim(),
      emails: [t.email, t.email2].filter((e): e is string => !!e),
    }))
}

// Wysyła do najemców, którzy mają przypisane klucze odczytów liczników
// (tenant_reading_keys w grupie rozliczeniowej ich nieruchomości), przypomnienie
// żeby dzisiaj podali odczyty - bo dzisiaj ostatni dzień miesiąca. Cron uderza
// w endpoint codziennie, więc tu pilnujemy, żeby faktycznie wysłać tylko raz,
// dokładnie ostatniego dnia miesiąca (sprawdzane jako "jutro jest 1. dzień").
export async function processMeterReadingReminder() {
  const now = await getCurrentDate()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (tomorrow.getDate() !== 1) {
    return { sent: false, reason: 'Not the last day of month' }
  }

  const supabase = createServiceClient()
  const dedupKey = `${now.getFullYear()}-${now.getMonth() + 1}`

  // Atomowe "zastrzeżenie" tego miesiąca - unique constraint na (action_name,
  // dedup_key) gwarantuje, że dwa równoległe wywołania nie przejdą oba.
  const { error: claimError } = await supabase
    .from('reminder_dedup')
    .insert({ action_name: 'meterReadingReminder', dedup_key: dedupKey })

  if (claimError) {
    if (claimError.code === '23505') {
      return { sent: false, reason: 'Already sent this month' }
    }
    throw claimError
  }

  const releaseClaim = () =>
    supabase
      .from('reminder_dedup')
      .delete()
      .eq('action_name', 'meterReadingReminder')
      .eq('dedup_key', dedupKey)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) {
    await releaseClaim()
    await logAudit({
      actionName: 'meterReadingReminder',
      operation: 'CREATE',
      errorData: 'NEXT_PUBLIC_APP_URL not configured',
    })
    return { sent: false, reason: 'NEXT_PUBLIC_APP_URL not configured' }
  }

  try {
  const { data: config } = await supabase
    .from('app_config')
    .select('meter_reading_reminder_subject, meter_reading_reminder_body')
    .eq('id', 1)
    .single()

  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, first_name, last_name, email, email2, property_id, reading_token, contracts(is_active, has_media_invoice)')

  if (tenantsError) throw tenantsError

  const eligibleTenants = (tenants ?? []).filter(
    (t) => t.email && t.contracts?.some((c) => c.is_active && c.has_media_invoice),
  )

  // Ten sam sposób liczenia "ile kluczy odczytów ma podać najemca" co w
  // app/(dashboard)/najemcy/actions.ts (getTenants) - najemca jest odbiorcą
  // przypomnienia tylko wtedy, gdy faktycznie ma co podać.
  const propertyIds = Array.from(
    new Set(eligibleTenants.map((t) => t.property_id).filter((id): id is number => id != null)),
  )

  const readingKeysCountByTenant: Record<number, number> = {}
  if (propertyIds.length > 0) {
    const { data: sgp } = await supabase
      .from('settlement_group_properties')
      .select('property_id, settlement_group_id')
      .in('property_id', propertyIds)

    const groupIds = Array.from(new Set((sgp ?? []).map((s) => s.settlement_group_id)))

    if (groupIds.length > 0) {
      const { data: groups } = await supabase
        .from('settlement_groups')
        .select('id, tenant_reading_keys')
        .in('id', groupIds)

      const readingKeysByGroup = new Map(
        (groups ?? []).map((g) => [g.id, g.tenant_reading_keys as Record<string, unknown[]> | null]),
      )
      const groupIdsByProperty = new Map<number, number[]>()
      for (const row of sgp ?? []) {
        const list = groupIdsByProperty.get(row.property_id) ?? []
        list.push(row.settlement_group_id)
        groupIdsByProperty.set(row.property_id, list)
      }

      for (const t of eligibleTenants) {
        if (t.property_id == null) continue
        let count = 0
        for (const gid of groupIdsByProperty.get(t.property_id) ?? []) {
          const keys = readingKeysByGroup.get(gid)?.[t.id.toString()]
          if (Array.isArray(keys)) count += keys.length
        }
        readingKeysCountByTenant[t.id] = count
      }
    }
  }

  const recipients = eligibleTenants.filter((t) => (readingKeysCountByTenant[t.id] ?? 0) > 0)

  const results: { tenantId: number; email: string; error?: string }[] = []

  for (const tenant of recipients) {
    const to = [tenant.email, tenant.email2].filter((e): e is string => !!e)
    const link = `${baseUrl}/odczyty/${tenant.reading_token}`
    const tenantName = `${tenant.first_name} ${tenant.last_name}`.trim()
    try {
      await sendMeterReadingReminderEmail(
        to,
        tenantName,
        link,
        config?.meter_reading_reminder_subject,
        config?.meter_reading_reminder_body,
      )
      results.push({ tenantId: tenant.id, email: to.join(', ') })
    } catch (e) {
      results.push({
        tenantId: tenant.id,
        email: to.join(', '),
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  await logAudit({
    actionName: 'meterReadingReminder',
    operation: 'CREATE',
    afterData: {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      count: results.filter((r) => !r.error).length,
      errors: results.filter((r) => r.error),
    },
  })

  return { sent: true, count: results.filter((r) => !r.error).length, results }
  } catch (e) {
    // Zwolnij zastrzeżenie tylko przy nieoczekiwanym błędzie (np. zapytanie do
    // tenants się wywaliło) - żeby kolejna próba mogła spróbować ponownie.
    // Pojedyncze błędy wysyłki do konkretnych najemców są już obsłużone wyżej
    // i nie trafiają tutaj.
    await releaseClaim()
    await logAudit({
      actionName: 'meterReadingReminder',
      operation: 'CREATE',
      errorData: e,
    })
    throw e
  }
}
