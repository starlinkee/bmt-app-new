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
import { ensureYearMonthFolder, copySpreadsheet, uploadPdfToDrive } from '@/lib/driveEngine'
import { sendMediaEmail } from '@/lib/email'
import { buildInvoiceNumber, tenantDisplayName } from '@/lib/utils'
import { amountToWordsPLN } from '@/lib/numberWords'

type InvoiceMappingEntry = { range: string; value: string }

function resolveInvoiceMapping(
  mapping: InvoiceMappingEntry[],
  vars: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of mapping) {
    result[entry.range] = entry.value.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
  }
  return result
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
}) {
  const supabase = createServiceClient()
  const { property_ids, ...rest } = data
  const { data: created, error } = await supabase
    .from('settlement_groups')
    .insert(rest)
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
    afterData: { ...rest, property_ids },
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
  },
) {
  const supabase = createServiceClient()
  const { property_ids, ...rest } = data

  const { data: before } = await supabase.from('settlement_groups').select('*').eq('id', id).single()

  if (Object.keys(rest).length) {
    const { error } = await supabase
      .from('settlement_groups')
      .update(rest)
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
      .select('id, email, email2, sender_account')
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
    .select('drive_invoices_folder_id, rent_invoice_spreadsheet_id, rent_invoice_input_mapping_json')
    .eq('id', 1)
    .single()

  // 1. Utwórz folder MM/YYYY i skopiuj szablon arkusza do niego
  const monthFolder = await ensureYearMonthFolder(year, month, config!.drive_invoices_folder_id)
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
  type PdfSheetDef = { gid?: string; tab?: string; name: string; range?: string; portrait?: boolean }
  const pdfSheets = (group as Record<string, unknown>).pdf_sheets_json as PdfSheetDef[] | undefined
  const baseName = sheetName.replace(/\//g, '-')

  const exportedPdfs: { name: string; driveId: string; buffer: Buffer }[] = []

  if (!pdfSheets || pdfSheets.length === 0) {
    const buffer = await exportSheetAsPdf(workingSheetId)
    const driveId = await uploadPdfToDrive(`${baseName}.pdf`, buffer, monthFolder)
    exportedPdfs.push({ name: baseName, driveId, buffer })
  } else {
    const allGids = await getAllSheetGids(workingSheetId)
    const pdfResults = await Promise.all(
      pdfSheets.map(async (sheet) => {
        const gid = sheet.tab ? allGids[sheet.tab] : sheet.gid
        const buffer = await exportSheetAsPdf(workingSheetId, gid, { printRange: sheet.range, portrait: sheet.portrait })
        const fileName = `${baseName} – ${sheet.name}.pdf`
        const driveId = await uploadPdfToDrive(fileName, buffer, monthFolder)
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

  // Pre-filtruj wpisy z pozytywnymi kwotami i pre-przydziel numery faktur (musi być sekwencyjne)
  const validEntries = outputEntries
    .map((entry) => {
      const amountStr = outputs[entry.range]
      const amount = parseFloat((amountStr ?? '').replace(',', '.'))
      if (!amount || amount <= 0) return null
      const tenant = tenantMap[entry.tenant_id]
      if (!tenant) return null
      const activeContract = (tenant.contracts as { is_active: boolean; contract_type: string }[] | undefined)?.find(
        (c) => c.is_active && c.contract_type === 'BUSINESS',
      )
      return { entry, amount, tenant, activeContract }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  let seqCounter = maxSeq
  const assignedEntries = validEntries.map((item) => ({
    ...item,
    invoiceNumber: item.activeContract ? buildInvoiceNumber(month, year, ++seqCounter) : undefined,
  }))

  // Przetwarzaj wszystkich najemców równolegle
  type TenantResult = { tenantName: string; amount: number; invoiceNumber: string; invoiceError?: string }
  const settled = await Promise.allSettled(
    assignedEntries.map(async ({ entry, amount, tenant, activeContract, invoiceNumber }) => {
      let invoicePdfBuffer: Buffer | undefined
      let invoiceError: string | undefined

      if (activeContract && invoiceNumber) {
        const { error } = await supabase.from('invoices').upsert(
          {
            type: entry.type,
            number: invoiceNumber,
            amount,
            month,
            year,
            tenant_id: tenant.id,
            contract_id: (activeContract as unknown as { id: number }).id,
            media_settlement_id: settlement.id,
          },
          { ignoreDuplicates: true },
        )
        if (error) return null

        // 9. Wygeneruj rachunek używając tego samego szablonu co czynsz (app_config)
        if (config?.rent_invoice_spreadsheet_id) {
          try {
            const dueDate = new Date(Date.UTC(year, month - 1, 10))
            const vars: Record<string, string> = {
              numer_rachunku: invoiceNumber,
              data_wystawienia: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('pl-PL'),
              termin_platnosci: dueDate.toLocaleDateString('pl-PL'),
              najemca: tenantDisplayName(tenant),
              adres_1: (tenant as Record<string, unknown>).address1 as string ?? '',
              adres_2: (tenant as Record<string, unknown>).address2 as string ?? '',
              nip: (tenant as Record<string, unknown>).nip as string ?? '',
              miesiac: String(month),
              rok: String(year),
              kwota: String(amount),
              kwota_slownie: amountToWordsPLN(amount),
              opis_rachunku: (activeContract as Record<string, unknown>).opis_rachunku_media as string
                || (activeContract as Record<string, unknown>).opis_rachunku as string
                || '',
            }

            const invoiceName = `Rachunek ${invoiceNumber.replace(/\//g, '-')} – ${tenantDisplayName(tenant)}`
            const invoiceSheetId = await copySpreadsheet(config.rent_invoice_spreadsheet_id, invoiceName, monthFolder, getServiceAccountEmail())

            const rawMapping = config.rent_invoice_input_mapping_json as InvoiceMappingEntry[] | null
            if (rawMapping?.length) {
              const resolved = resolveInvoiceMapping(rawMapping, vars)
              const inputMapping = Object.fromEntries(Object.keys(resolved).map((k) => [k, k]))
              await writeInputValues(invoiceSheetId, inputMapping, resolved)
            }

            try { await stripSpreadsheetColors(invoiceSheetId) } catch {}

            invoicePdfBuffer = await exportSheetAsPdf(invoiceSheetId)
            await uploadPdfToDrive(`${invoiceNumber.replace(/\//g, '-')}.pdf`, invoicePdfBuffer, monthFolder)
          } catch (e) {
            invoiceError = e instanceof Error ? e.message : String(e)
            console.error('[media] Błąd generowania rachunku dla najemcy', tenant.id, ':', invoiceError)
          }
        }
      } else {
        // PRIVATE: zapisz należność bez formalnego numeru rachunku
        await supabase.from('invoices').upsert(
          {
            type: entry.type,
            number: null,
            amount,
            month,
            year,
            tenant_id: tenant.id,
            contract_id: null,
            media_settlement_id: settlement.id,
          },
          { ignoreDuplicates: true },
        )
      }

      if (tenant.email) {
        const attachments = (entry.email_pdfs ?? [])
          .map((name: string) => pdfMap[name])
          .filter(Boolean)
          .map((p: { name: string; buffer: Buffer }) => ({
            filename: `${p.name}_${String(month).padStart(2, '0')}_${year}.pdf`,
            buffer: p.buffer,
          }))

        if (invoicePdfBuffer && invoiceNumber) {
          attachments.push({
            filename: `Rachunek_${invoiceNumber.replace(/\//g, '-')}.pdf`,
            buffer: invoicePdfBuffer,
          })
        }

        const recipients = [tenant.email, tenant.email2].filter(Boolean) as string[]
        const senderAccount = ((tenant as Record<string, unknown>).sender_account as number ?? 1) === 2 ? 2 : 1
        await sendMediaEmail(
          recipients,
          tenantDisplayName(tenant),
          invoiceNumber ?? `${String(month).padStart(2, '0')}/${year}`,
          amount,
          month,
          year,
          attachments,
          (group as Record<string, unknown>).email_subject_template as string | null,
          (group as Record<string, unknown>).email_body_template as string | null,
          senderAccount,
        )
      }

      return {
        tenantName: tenantDisplayName(tenant),
        amount,
        invoiceNumber: invoiceNumber ?? `${String(month).padStart(2, '0')}/${year}`,
        invoiceError,
      } satisfies TenantResult
    }),
  )

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
