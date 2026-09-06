'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import {
  writeInputValues,
  validateNamedRanges,
  readOutputValues,
  exportSheetAsPdf,
  getAllSheetGids,
  getServiceAccountEmail,
  stripSpreadsheetColors,
} from '@/lib/sheetsEngine'
import { copySpreadsheet, deleteFile } from '@/lib/driveEngine'
import { sendMediaEmail } from '@/lib/email'
import { buildInvoiceNumber, tenantDisplayName } from '@/lib/utils'


async function uploadToSupabaseStorage(supabase: any, year: number, month: number, fileName: string, buffer: Buffer): Promise<string> {
  const filePath = `${year}/${String(month).padStart(2, '0')}/${fileName}`
  const { error } = await supabase.storage.from('invoices').upload(filePath, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) {
    console.error('Błąd wgrywania pliku do Storage:', error)
  }
  return filePath
}

export async function getSettlementGroups() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('settlement_groups')
    .select('*, settlement_group_properties(property_id, properties(name, address1, address2))')
    .order('name')
  if (error) throw error
  return data
}

export async function getSettlementGroup(id: number) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('settlement_groups')
    .select('*, settlement_group_properties(property_id, properties(name, address1, address2))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createSettlementGroup(data: {
  name: string
  spreadsheet_id: string
  input_mapping_json: Record<string, string>
  output_mapping_json: Record<string, string>
  pdf_sheets_json?: Record<string, string>[]
  email_subject_template?: string
  email_body_template?: string
  property_ids: number[]
  tenant_reading_keys?: string[]
}) {
  const supabase = createServiceClient()
  const { property_ids, tenant_reading_keys, ...groupData } = data
  
  const payload = { ...groupData }
  if (tenant_reading_keys) {
    (payload as Record<string, unknown>).tenant_reading_keys = tenant_reading_keys
  }

  const { data: created, error } = await supabase
    .from('settlement_groups')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw error

  if (property_ids.length) {
    await supabase.from('settlement_group_properties').insert(
      property_ids.map((pid) => ({
        settlement_group_id: created.id,
        property_id: pid,
      })),
    )
  }

  await logAudit({
    actionName: 'createSettlementGroup',
    tableName: 'settlement_groups',
    operation: 'CREATE',
    recordId: created.id,
    afterData: { ...groupData, property_ids, tenant_reading_keys },
  })
  revalidatePath('/media')
}

export async function updateSettlementGroup(
  id: number,
  data: {
    name?: string
    spreadsheet_id?: string
    input_mapping_json?: Record<string, string>
    output_mapping_json?: Record<string, string>
    pdf_sheets_json?: Record<string, string>[]
    email_subject_template?: string
    email_body_template?: string
    property_ids?: number[]
    tenant_reading_keys?: string[]
  },
) {
  const supabase = createServiceClient()
  const { property_ids, tenant_reading_keys, ...rest } = data

  const { data: before } = await supabase.from('settlement_groups').select('*').eq('id', id).single()

  const payload = { ...rest }
  if (tenant_reading_keys !== undefined) {
    (payload as Record<string, unknown>).tenant_reading_keys = tenant_reading_keys
  }

  if (Object.keys(payload).length) {
    const { error } = await supabase
      .from('settlement_groups')
      .update(payload)
      .eq('id', id)
    if (error) {
      await logAudit({ actionName: 'updateSettlementGroup', tableName: 'settlement_groups', operation: 'UPDATE', recordId: id, beforeData: before, errorData: error })
      throw error
    }
  }

  if (property_ids !== undefined) {
    await supabase
      .from('settlement_group_properties')
      .delete()
      .eq('settlement_group_id', id)

    if (property_ids.length) {
      await supabase.from('settlement_group_properties').insert(
        property_ids.map((pid) => ({
          settlement_group_id: id,
          property_id: pid,
        })),
      )
    }
  }

  const { data: after } = await supabase.from('settlement_groups').select('*').eq('id', id).single()
  await logAudit({ actionName: 'updateSettlementGroup', tableName: 'settlement_groups', operation: 'UPDATE', recordId: id, beforeData: before, afterData: after })

  revalidatePath('/media')
  revalidatePath(`/media/${id}`)
}

export async function deleteSettlementGroup(id: number) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('settlement_groups').select('*').eq('id', id).single()
  const { error } = await supabase
    .from('settlement_groups')
    .delete()
    .eq('id', id)
  if (error) {
    await logAudit({ actionName: 'deleteSettlementGroup', tableName: 'settlement_groups', operation: 'DELETE', recordId: id, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'deleteSettlementGroup', tableName: 'settlement_groups', operation: 'DELETE', recordId: id, beforeData: before })
  revalidatePath('/media')
}

type FieldDef = string | { range: string; source: 'user'; save_key?: string } | { range: string; source: 'db'; db_key: string } | { range: string; source: 'auto'; auto_type: string }

export async function getMediaEmailPreview(groupId: number) {
  const supabase = createServiceClient()

  const group = await getSettlementGroup(groupId)
  if (!group) return { entries: [] as { email: string | null; count: number; recipients: string[] }[], total: 0 }

  const outputEntries = group.output_mapping_json as { range: string; tenant_id: number }[]
  const tenantIds = [...new Set(outputEntries.map((e) => e.tenant_id))]

  const [tenantsResult, appConfigResult] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, email, email2, sender_account, contracts(is_active, has_media_invoice)')
      .in('id', tenantIds),
    supabase
      .from('app_config')
      .select('gmail_user, gmail_user_2')
      .eq('id', 1)
      .single(),
  ])

  const recipients1: string[] = []
  const recipients2: string[] = []
  for (const t of tenantsResult.data ?? []) {
    const hasMediaContract = (t.contracts as { is_active: boolean; has_media_invoice: boolean }[] | undefined)?.some(
      (c) => c.is_active && c.has_media_invoice
    )
    if (!hasMediaContract) continue
    if (!t.email) continue
    const acc = ((t as { sender_account?: number | null }).sender_account ?? 1) === 2 ? 2 : 1
    const emails = [t.email, (t as Record<string, unknown>).email2 as string | null].filter(Boolean) as string[]
    if (acc === 2) recipients2.push(...emails)
    else recipients1.push(...emails)
  }

  const entries: { email: string | null; count: number; recipients: string[] }[] = []
  if (recipients1.length > 0) entries.push({ email: appConfigResult.data?.gmail_user ?? null, count: recipients1.length, recipients: recipients1 })
  if (recipients2.length > 0) entries.push({ email: appConfigResult.data?.gmail_user_2 ?? null, count: recipients2.length, recipients: recipients2 })

  return { entries, total: recipients1.length + recipients2.length }
}

export async function getSettlementForMonth(
  groupId: number,
  month: number,
  year: number,
): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('media_settlements')
    .select('id')
    .eq('group_id', groupId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle()
  return !!data
}

export async function getPreviousMeterReadings(
  groupId: number,
  month: number,
  year: number,
): Promise<Record<string, number>> {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('media_meter_readings')
    .select('key, value, month, year')
    .eq('group_id', groupId)
    .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  const result: Record<string, number> = {}
  for (const row of data ?? []) {
    if (!(row.key in result)) result[row.key] = Number(row.value)
  }
  return result
}

export async function getCurrentMeterReadings(
  groupId: number,
  month: number,
  year: number,
): Promise<Record<string, number>> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('media_meter_readings')
    .select('key, value')
    .eq('group_id', groupId)
    .eq('month', month)
    .eq('year', year)

  const result: Record<string, number> = {}
  for (const row of data ?? []) {
    result[row.key] = Number(row.value)
  }
  return result
}

export async function processSettlement(
  groupId: number,
  inputValues: Record<string, string | number>,
  month: number,
  year: number,
  previousReadingOverrides?: Record<string, string>,
) {
  try {
  const supabase = createServiceClient()

  const group = await getSettlementGroup(groupId)
  if (!group) throw new Error('Grupa nie istnieje')

  const firstProp = (group.settlement_group_properties as { property_id: number; properties: { name: string; address1?: string | null; address2?: string | null } | null }[])[0]?.properties
  const propertyAddress = firstProp
    ? [firstProp.address2, firstProp.address1].filter(Boolean).join(', ')
    : ''

  const { data: config } = await supabase
    .from('app_config')
    .select('drive_invoices_folder_id, rent_invoice_spreadsheet_id, rent_invoice_input_mapping_json, rent_invoice_pdf_gid')
    .eq('id', 1)
    .single()

  // 1. Utwórz folder MM/YYYY i skopiuj szablon arkusza do niego
  // Month folder is handled in Supabase Storage directly
  const sheetName = `Media ${String(month).padStart(2, '0')}/${year} – ${group.name}`
  const workingSheetId = await copySpreadsheet(
    group.spreadsheet_id,
    sheetName,
    monthFolder,
    getServiceAccountEmail(),
  )

  // 2. Zbuduj finalny zestaw wartości: user input + auto-fill z DB dla pól source:"db"
  const nestedInput = group.input_mapping_json as Record<string, Record<string, FieldDef>>
  const previousReadingsFromDb = await getPreviousMeterReadings(groupId, month, year)
  const previousReadings: Record<string, number> = { ...previousReadingsFromDb }
  for (const [key, val] of Object.entries(previousReadingOverrides ?? {})) {
    const n = parseFloat(String(val).replace(/,/g, '.'))
    if (!isNaN(n)) previousReadings[key] = n
  }

  const flatMapping: Record<string, string> = {}
  const allValues: Record<string, string | number> = { ...inputValues }
  const toSave: { key: string; value: number }[] = []

  for (const fields of Object.values(nestedInput)) {
    for (const [, fieldDef] of Object.entries(fields)) {
      if (typeof fieldDef === 'string') {
        // stary format — traktuj jak source:"user"
        flatMapping[fieldDef] = fieldDef
      } else if (fieldDef.source === 'user') {
        flatMapping[fieldDef.range] = fieldDef.range
        if (fieldDef.save_key) {
          const val = parseFloat(String(inputValues[fieldDef.range] ?? '0').replace(/,/g, '.'))
          if (!isNaN(val)) toSave.push({ key: fieldDef.save_key, value: val })
        }
      } else if (fieldDef.source === 'db') {
        flatMapping[fieldDef.range] = fieldDef.range
        const prev = previousReadings[fieldDef.db_key]
        if (prev !== undefined) allValues[fieldDef.range] = prev
      } else if (fieldDef.source === 'auto') {
        flatMapping[fieldDef.range] = fieldDef.range
        if ((fieldDef as { auto_type?: string }).auto_type === 'property_address' && propertyAddress) {
          allValues[fieldDef.range] = propertyAddress
        }
      }
    }
  }

  const { missing } = await validateNamedRanges(workingSheetId, Object.keys(flatMapping))
  if (missing.length > 0) {
    throw new Error(`Brakujące named ranges w arkuszu: ${missing.join(', ')}`)
  }

  const normalizedAllValues: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(allValues)) {
    normalizedAllValues[k] = typeof v === 'string' ? v.replace(/,/g, '.') : v
  }

  await writeInputValues(workingSheetId, flatMapping, normalizedAllValues)
  try { await stripSpreadsheetColors(workingSheetId) } catch {}

  type OutputEntry = { range: string; tenant_id: number; type: string; email_pdfs?: string[] }
  const outputEntries = group.output_mapping_json as OutputEntry[]

  // 4. Odczytaj wyniki z kopii
  const rangeMapping = Object.fromEntries(outputEntries.map((e) => [e.range, e.range]))
  const outputs = await readOutputValues(workingSheetId, rangeMapping)

  // 5. Eksportuj PDF — osobny plik per sheet zdefiniowany w pdf_sheets_json
  // `tab` = tytuł zakładki w arkuszu (do wyszukania GID po skopiowaniu), `name` = etykieta PDF
  type PdfSheetDef = { gid?: string; tab?: string; name: string; range?: string; portrait?: boolean; fitToPage?: boolean }
  const pdfSheets = (group as Record<string, unknown>).pdf_sheets_json as PdfSheetDef[] | undefined
  const baseName = sheetName.replace(/\//g, '-')

  const exportedPdfs: { name: string; driveId: string; buffer: Buffer }[] = []

  if (!pdfSheets || pdfSheets.length === 0) {
    const buffer = await exportSheetAsPdf(workingSheetId)
    const driveId = await uploadToSupabaseStorage(supabase, year, month, `${baseName}.pdf`, buffer)
    exportedPdfs.push({ name: baseName, driveId, buffer })
  } else {
    const allGids = await getAllSheetGids(workingSheetId)
    const pdfResults = await Promise.all(
      pdfSheets.map(async (sheet) => {
        const gid = sheet.tab ? allGids[sheet.tab] : sheet.gid
        const buffer = await exportSheetAsPdf(workingSheetId, gid, { printRange: sheet.range, portrait: sheet.portrait, fitToPage: sheet.fitToPage })
        const fileName = `${baseName} – ${sheet.name}.pdf`
        const driveId = await uploadToSupabaseStorage(supabase, year, month, fileName, buffer)
        return { name: sheet.name, driveId, buffer }
      }),
    )
    exportedPdfs.push(...pdfResults)
  }

  // 6. Zapisz rozliczenie w bazie
  const { data: settlement, error: settlementError } = await supabase
    .from('media_settlements')
    .upsert(
      {
        group_id: groupId,
        month,
        year,
        spreadsheet_id: workingSheetId,
        drive_pdf_ids: exportedPdfs.map((p) => ({ name: p.name, id: p.driveId })),
      },
      { onConflict: 'group_id,month,year' },
    )
    .select('id')
    .single()
  if (settlementError) throw settlementError

  // Zapisz odczyty liczników do DB (dla następnego miesiąca jako "poprzednie")
  if (toSave.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('media_meter_readings').upsert(
      toSave.map(({ key, value }) => ({ group_id: groupId, month, year, key, value })),
      { onConflict: 'group_id,month,year,key' },
    )
  }

  // 7. Pobierz najemców potrzebnych do faktur
  const tenantIds = [...new Set(outputEntries.map((e) => e.tenant_id))]
  const { data: tenants } = await supabase
    .from('tenants')
    .select('*, contracts(*)')
    .in('id', tenantIds)
  const tenantMap = Object.fromEntries((tenants ?? []).map((t) => [t.id, t]))

  // 8. Utwórz rachunki / wyślij maile zgodnie z output_mapping_json

  // Pobierz MAX numer rachunku z tego miesiąca (np. po RENT) jako punkt startowy
  const { data: lastInvoice } = await supabase
    .from('invoices')
    .select('number')
    .eq('month', month)
    .eq('year', year)
    .not('number', 'is', null)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle()
  const maxSeq = lastInvoice?.number ? parseInt(lastInvoice.number.split('/')[2]) : 0

  const pdfMap = Object.fromEntries(exportedPdfs.map((p) => [p.name, p]))

  console.log('[media] outputs:', JSON.stringify(outputs))
  console.log('[media] outputEntries ranges:', outputEntries.map(e => e.range))

  // Pre-filtruj wpisy z pozytywnymi kwotami i pre-przydziel numery faktur (musi być sekwencyjne)
  const validEntries = outputEntries
    .map((entry) => {
      const amountStr = outputs[entry.range] ?? ''
      const isSheetError = amountStr.startsWith('#')
      const amount = isSheetError ? 0 : parseFloat(amountStr.replace(',', '.'))
      if (!isSheetError && isNaN(amount)) return null
      if (amount < 0) throw new Error(`Ujemna kwota (${amount} zł) dla zakresu ${entry.range} — sprawdź odczyty licznika`)
      const tenant = tenantMap[entry.tenant_id]
      if (!tenant) return null
      
      const activeContract = (tenant.contracts as { is_active: boolean; contract_type: string; has_media_invoice: boolean; id: number }[] | undefined)?.find(
        (c) => c.is_active && c.has_media_invoice,
      )
      
      if (!activeContract) {
        throw new Error(`Najemca ${tenant.first_name} ${tenant.last_name} nie posiada aktywnej umowy z włączoną opcją rozliczania mediów. Zaktualizuj umowę przed rozliczeniem.`)
      }
      
      return { entry, amount, tenant, activeContract }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const assignedEntries = validEntries.map((item) => {
    return {
      ...item,
      invoiceNumber: undefined,
    }
  })

  // Przetwarzaj wszystkich najemców równolegle
  type TenantResult = { tenantName: string; amount: number; invoiceNumber: string | null; invoiceError?: string; emailError?: string }
  const settled = await Promise.allSettled(
    assignedEntries.map(async ({ entry, amount, tenant, activeContract }) => {
      let invoicePdfBuffer: Buffer | undefined
      let invoiceError: string | undefined

      // Zapisz należność bez formalnego numeru rachunku
      await supabase.from('invoices').upsert(
        {
          type: entry.type,
          number: null,
          amount,
          month,
          year,
          tenant_id: tenant.id,
          contract_id: activeContract.id,
          media_settlement_id: settlement.id,
        },
        { ignoreDuplicates: true },
      )

      // 9. Wygeneruj Notę Rozliczeniową (Mockup) dla każdego najemcy
      try {
        const { generateMockupNotaPdfBuffer } = await import('@/lib/pdf')
        const tenantName = tenantDisplayName(tenant)
        invoicePdfBuffer = await generateMockupNotaPdfBuffer(tenantName, amount, month, year)
        
        const fileName = `Nota_Rozliczeniowa_${tenantName.replace(/\s+/g, '_')}_${month}_${year}.pdf`
        await uploadToSupabaseStorage(supabase, year, month, fileName, invoicePdfBuffer)
      } catch (e) {
        invoiceError = e instanceof Error ? e.message : String(e)
        console.error('[media] Błąd generowania noty dla najemcy', tenant.id, ':', invoiceError)
      }

      let emailError: string | undefined
      if (tenant.email) {
        const attachments = (entry.email_pdfs ?? [])
          .map((name: string) => pdfMap[name])
          .filter(Boolean)
          .map((p: { name: string; buffer: Buffer }) => ({
            filename: `${p.name}_${String(month).padStart(2, '0')}_${year}.pdf`,
            buffer: p.buffer,
          }))

        if (invoicePdfBuffer) {
          attachments.push({
            filename: `Nota_Rozliczeniowa_${String(month).padStart(2, '0')}_${year}.pdf`,
            buffer: invoicePdfBuffer,
          })
        }

        const recipients = [tenant.email, tenant.email2].filter(Boolean) as string[]
        const senderAccount = ((tenant as Record<string, unknown>).sender_account as number ?? 1) === 2 ? 2 : 1
        try {
          await sendMediaEmail(
            recipients,
            tenantDisplayName(tenant),
            `${String(month).padStart(2, '0')}/${year}`,
            amount,
            month,
            year,
            attachments,
            (group as Record<string, unknown>).email_subject_template as string | null,
            (group as Record<string, unknown>).email_body_template as string | null,
            senderAccount,
          )
        } catch (e) {
          emailError = e instanceof Error ? e.message : String(e)
          console.error('[media] Błąd wysyłania emaila do najemcy', tenant.id, ':', emailError)
        }
      }

      return {
        tenantName: tenantDisplayName(tenant),
        amount,
        invoiceNumber: null,
        invoiceError,
        emailError,
      } satisfies TenantResult
    }),
  )

  console.log('[media] settled:', settled.map(r => r.status === 'rejected' ? `REJECTED: ${r.reason}` : `fulfilled: ${JSON.stringify(r.value)}`))
  const results = settled.reduce<TenantResult[]>((acc, r) => {
    if (r.status === 'fulfilled' && r.value !== null) acc.push(r.value)
    return acc
  }, [])

  await logAudit({
    actionName: 'processSettlement',
    tableName: 'media_settlements',
    operation: 'UPSERT',
    recordId: `${groupId}/${month}/${year}`,
    afterData: { groupId, month, year, count: results.length, results },
  })
  revalidatePath(`/media/${groupId}`)

  return results
  } catch (e) {
    await logAudit({
      actionName: 'processSettlement',
      tableName: 'media_settlements',
      operation: 'UPSERT',
      recordId: `${groupId}/${month}/${year}`,
      errorData: e,
    })
    throw e
  }
}
