'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import {
  writeInputValues,
  validateNamedRanges,
  readOutputValues,
  exportSheetAsPdf,
  getSheetGidByName,
} from '@/lib/sheetsEngine'
import { ensureYearMonthFolder, copySpreadsheet, uploadPdfToDrive } from '@/lib/driveEngine'
import { getServiceAccountEmail } from '@/lib/sheetsEngine'
import { sendMediaEmail } from '@/lib/email'
import { tenantDisplayName } from '@/lib/utils'
import { markMonthlyTaskDone } from '@/lib/tasks'
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
    .select('*, settlement_group_properties(property_id, properties(name))')
    .order('name')
  if (error) throw error
  return data
}

export async function getSettlementGroup(id: number) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('settlement_groups')
    .select('*, settlement_group_properties(property_id, properties(name))')
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
  const { property_ids, email_subject_template, email_body_template, ...rest } = data
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
  const { property_ids, email_subject_template, email_body_template, ...rest } = data

  if (Object.keys(rest).length) {
    const { error } = await supabase
      .from('settlement_groups')
      .update(rest)
      .eq('id', id)
    if (error) throw error
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

  revalidatePath('/media')
  revalidatePath(`/media/${id}`)
}

export async function deleteSettlementGroup(id: number) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('settlement_groups')
    .delete()
    .eq('id', id)
  if (error) throw error
  revalidatePath('/media')
}

type FieldDef = string | { range: string; source: 'user'; save_key?: string } | { range: string; source: 'db'; db_key: string }

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
) {
  const supabase = createServiceClient()

  const group = await getSettlementGroup(groupId)
  if (!group) throw new Error('Grupa nie istnieje')

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
  const previousReadings = await getPreviousMeterReadings(groupId, month, year)

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
          const val = parseFloat(String(inputValues[fieldDef.range] ?? '0').replace(',', '.'))
          if (!isNaN(val)) toSave.push({ key: fieldDef.save_key, value: val })
        }
      } else if (fieldDef.source === 'db') {
        flatMapping[fieldDef.range] = fieldDef.range
        const prev = previousReadings[fieldDef.db_key]
        if (prev !== undefined) allValues[fieldDef.range] = prev
      }
    }
  }

  const { missing } = await validateNamedRanges(workingSheetId, Object.keys(flatMapping))
  if (missing.length > 0) {
    throw new Error(`Brakujące named ranges w arkuszu: ${missing.join(', ')}`)
  }

  await writeInputValues(workingSheetId, flatMapping, allValues)

  type OutputEntry = { range: string; tenant_id: number; type: string; email_pdfs?: string[] }
  const outputEntries = group.output_mapping_json as OutputEntry[]

  // 4. Odczytaj wyniki z kopii
  const rangeMapping = Object.fromEntries(outputEntries.map((e) => [e.range, e.range]))
  const outputs = await readOutputValues(workingSheetId, rangeMapping)

  // 5. Eksportuj PDF — osobny plik per sheet zdefiniowany w pdf_sheets_json
  // `tab` = tytuł zakładki w arkuszu (do wyszukania GID po skopiowaniu), `name` = etykieta PDF
  type PdfSheetDef = { gid?: string; tab?: string; name: string }
  const pdfSheets = (group as Record<string, unknown>).pdf_sheets_json as PdfSheetDef[] | undefined
  const baseName = sheetName.replace(/\//g, '-')

  const exportedPdfs: { name: string; driveId: string; buffer: Buffer }[] = []

  if (!pdfSheets || pdfSheets.length === 0) {
    const buffer = await exportSheetAsPdf(workingSheetId)
    const driveId = await uploadPdfToDrive(`${baseName}.pdf`, buffer, monthFolder)
    exportedPdfs.push({ name: baseName, driveId, buffer })
  } else {
    for (const sheet of pdfSheets) {
      const gid = sheet.tab
        ? await getSheetGidByName(workingSheetId, sheet.tab)
        : sheet.gid
      const buffer = await exportSheetAsPdf(workingSheetId, gid)
      const fileName = `${baseName} – ${sheet.name}.pdf`
      const driveId = await uploadPdfToDrive(fileName, buffer, monthFolder)
      exportedPdfs.push({ name: sheet.name, driveId, buffer })
    }
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

  const results: { tenantName: string; amount: number; invoiceNumber: string }[] = []

  // 7. Pobierz najemców potrzebnych do faktur
  const tenantIds = [...new Set(outputEntries.map((e) => e.tenant_id))]
  const { data: tenants } = await supabase
    .from('tenants')
    .select('*, contracts(*)')
    .in('id', tenantIds)
  const tenantMap = Object.fromEntries((tenants ?? []).map((t) => [t.id, t]))

  // 8. Utwórz rachunki / wyślij maile zgodnie z output_mapping_json
  for (const entry of outputEntries) {
    const amountStr = outputs[entry.range]
    const amount = parseFloat((amountStr ?? '').replace(',', '.'))
    if (!amount || amount <= 0) continue

    const tenant = tenantMap[entry.tenant_id]
    if (!tenant) continue

    const activeContract = tenant.contracts?.find(
      (c: { is_active: boolean; contract_type: string; has_media_invoice?: boolean }) =>
        c.is_active && c.contract_type === 'BUSINESS' && c.has_media_invoice,
    )

    let invoiceNumber: string | undefined
    let invoicePdfBuffer: Buffer | undefined

    if (activeContract) {
      const mediaSeq = (activeContract as Record<string, unknown>).media_invoice_seq_number as number | null
      const mm = String(month).padStart(2, '0')
      const seq = String(mediaSeq ?? activeContract.invoice_seq_number).padStart(3, '0')
      invoiceNumber = `${mm}/${year}/${seq}`

      const { error } = await supabase.from('invoices').upsert(
        {
          type: entry.type,
          number: invoiceNumber,
          amount,
          month,
          year,
          tenant_id: tenant.id,
          contract_id: activeContract.id,
          media_settlement_id: settlement.id,
        },
        { onConflict: 'contract_id,type,month,year', ignoreDuplicates: true },
      )
      if (error) continue

      // 9. Wygeneruj rachunek używając tego samego szablonu co czynsz (app_config)
      if (config?.rent_invoice_spreadsheet_id) {
        try {
          const dueDate = new Date(Date.UTC(year, month, 10))
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

          invoicePdfBuffer = await exportSheetAsPdf(invoiceSheetId)
          await uploadPdfToDrive(`${invoiceNumber.replace(/\//g, '-')}.pdf`, invoicePdfBuffer, monthFolder)
        } catch {
          // Rachunek opcjonalny — kontynuuj bez niego
        }
      }
    }

    if (tenant.email) {
      const pdfMap = Object.fromEntries(exportedPdfs.map((p) => [p.name, p]))
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
      )
    }

    results.push({
      tenantName: tenantDisplayName(tenant),
      amount,
      invoiceNumber: invoiceNumber ?? `${String(month).padStart(2, '0')}/${year}`,
    })
  }

  await markMonthlyTaskDone('MEDIA', month, year)
  revalidatePath(`/media/${groupId}`)

  return results
}
