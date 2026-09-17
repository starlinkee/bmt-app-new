'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { getEligibleMeterReminderTenants } from '@/lib/meter-reading-reminder'
import { getRentPreview } from '@/lib/rents'
import { getCurrentDate } from '@/lib/clock'
import { tenantDisplayName } from '@/lib/utils'
import type { Json } from '@/types/supabase'

// Umowy, które zostałyby obciążone czynszem, gdyby generowanie odpaliło się
// teraz dla NASTĘPNEGO miesiąca (czyli to, co realnie naliczy się 1. dnia
// tego nadchodzącego miesiąca) — do podglądu w Automatyzacjach.
export async function getUpcomingRentCharges() {
  const now = await getCurrentDate()
  let month = now.getMonth() + 2 // getMonth() jest 0-indeksowany; +2 = następny miesiąc, 1-indeksowany
  let year = now.getFullYear()
  if (month > 12) {
    month -= 12
    year += 1
  }

  const { withEmail, withoutEmail } = await getRentPreview(month, year)
  const contracts = [...withEmail, ...withoutEmail]

  return {
    month,
    year,
    tenants: contracts.map((c) => {
      const tenant = c.tenants as { id: number; first_name: string; last_name: string; tenant_type?: string | null; company_name?: string | null; properties?: { name: string } | null } | null
      return {
        id: tenant?.id ?? null,
        name: tenant ? tenantDisplayName(tenant) : '—',
        property: tenant?.properties?.name ?? null,
        amount: Number(c.rent_amount),
      }
    }),
  }
}

// Te same domyślne szablony co w lib/email.ts (sendMediaEmail), używane gdy
// grupa nie ma ustawionego własnego — pokazujemy je tu tylko informacyjnie,
// żeby podgląd nie kłamał, że maila w ogóle nie będzie.
const DEFAULT_MEDIA_EMAIL_SUBJECT = 'Faktura media {numer_rachunku}'
const DEFAULT_MEDIA_EMAIL_BODY =
  'Szanowny/a {imie},\nW załączeniu rozliczenie mediów nr {numer_rachunku} za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy,\nBMT'

// Dla każdej grupy rozliczeniowej: kto obecnie (na podstawie umów z włączonymi
// mediami) dostałby maila po rozliczeniu tej grupy, i jaka jest skonfigurowana
// treść tego maila. Nie liczy kwot (te powstają dopiero przy realnym
// rozliczeniu w Rozlicz media) — to tylko podgląd odbiorców i szablonu.
export async function getMediaGroupEmailPreviews() {
  const supabase = createServiceClient()

  const { data: groups } = await supabase
    .from('settlement_groups')
    .select('id, name, email_subject_template, email_body_template, output_mapping_json, settlement_group_properties(property_id)')
    .order('name')

  if (!groups || groups.length === 0) return []

  const allPropertyIds = Array.from(
    new Set(groups.flatMap((g) => (g.settlement_group_properties ?? []).map((p) => p.property_id))),
  )

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, first_name, last_name, tenant_type, company_name, email, email2, property_id, contracts(is_active, has_media_invoice)')
    .in('property_id', allPropertyIds.length ? allPropertyIds : [-1])

  const eligibleTenants = (tenants ?? []).filter(
    (t) => t.email && t.contracts?.some((c) => c.is_active && c.has_media_invoice),
  )

  return groups.map((g) => {
    const propertyIds = new Set((g.settlement_group_properties ?? []).map((p) => p.property_id))

    // Załączniki idą per wpis w output_mapping_json (pole email_pdfs) — jeśli
    // najemca ma tam kilka wpisów (np. kilka pozycji do rozliczenia), zbieramy
    // unikalne nazwy plików ze wszystkich. Brak email_pdfs = mail bez PDF-u
    // (patrz processSettlement w Rozlicz media).
    const outputEntries = (g.output_mapping_json ?? []) as { tenant_id: number; email_pdfs?: string[] }[]
    const attachmentsByTenant = new Map<number, Set<string>>()
    for (const entry of outputEntries) {
      const names = attachmentsByTenant.get(entry.tenant_id) ?? new Set<string>()
      for (const name of entry.email_pdfs ?? []) names.add(name)
      attachmentsByTenant.set(entry.tenant_id, names)
    }

    const recipients = eligibleTenants
      .filter((t) => t.property_id != null && propertyIds.has(t.property_id))
      .map((t) => ({
        id: t.id,
        name: tenantDisplayName(t),
        emails: [t.email, t.email2].filter((e): e is string => !!e),
        attachments: Array.from(attachmentsByTenant.get(t.id) ?? []),
      }))

    return {
      groupId: g.id,
      groupName: g.name,
      subject: g.email_subject_template || DEFAULT_MEDIA_EMAIL_SUBJECT,
      body: g.email_body_template || DEFAULT_MEDIA_EMAIL_BODY,
      recipients,
    }
  })
}

export async function getAppConfig() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 1)
    .single()
  return data
}

export async function upsertAppConfig(data: {
  rent_invoice_spreadsheet_id?: string
  rent_invoice_input_mapping_json?: Json
  rent_invoice_pdf_gid?: string
  drive_invoices_folder_id?: string
  reminder_subject?: string
  reminder_body?: string
  late_reminder_subject?: string
  late_reminder_body?: string
  rent_email_subject?: string | null
  rent_email_body?: string | null
  meter_reading_reminder_subject?: string | null
  meter_reading_reminder_body?: string | null
  meter_reading_closed_message?: string | null
}) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('app_config').select('*').eq('id', 1).single()
  const { data: after, error } = await supabase.from('app_config').update(data).eq('id', 1).select().single()
  if (error) {
    await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, afterData: after })
  revalidatePath('/automatyzacje')
}

// Strona jest wyłącznie do odczytu — ta akcja tylko zbiera informacje
// potrzebne do wyświetlenia (kiedy ostatnio coś faktycznie wysłano, na jaki
// adres administratora, jaki szablon). Nic tu nic nie zmienia ani nie wysyła.
export async function getAutomationStatus() {
  const supabase = createServiceClient()

  const [{ data: config }, { data: lastUploadReminder }, { data: lastRentGeneration }, { data: lastMeterReminder }, meterReminderRecipients] = await Promise.all([
    supabase
      .from('app_config')
      .select('gmail_user, gmail_user_2, meter_reading_reminder_subject, meter_reading_reminder_body, admin_email')
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
    getEligibleMeterReminderTenants(),
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
    adminEmail: config?.admin_email ?? null,
    gmailUser1: config?.gmail_user ?? null,
    gmailUser2: config?.gmail_user_2 ?? null,
    meterReadingReminderSubject: config?.meter_reading_reminder_subject ?? null,
    lastUploadReminderSentAt: lastUploadReminder?.created_at ?? null,
    lastRentGenerationAt: lastRentGeneration?.created_at ?? null,
    lastRentGenerationInfo: lastRentGenerationData
      ? `${lastRentGenerationData.month}/${lastRentGenerationData.year} — utworzono ${lastRentGenerationData.count ?? 0}, pominięto ${lastRentGenerationData.skippedCount ?? 0} (źródło: ${lastRentGenerationData.source ?? '?'})`
      : null,
    lastMeterReminderSentAt: lastMeterReminder?.created_at ?? null,
    lastMeterReminderInfo: lastMeterReminderData
      ? `${lastMeterReminderData.month}/${lastMeterReminderData.year} — wysłano do ${lastMeterReminderData.count ?? 0} najemców${lastMeterReminderData.errors && lastMeterReminderData.errors.length > 0 ? `, błędy: ${lastMeterReminderData.errors.length}` : ''}`
      : null,
    meterReminderRecipients,
  }
}
