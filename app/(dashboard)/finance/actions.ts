'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { buildInvoiceNumber } from '@/lib/utils'
import { exportSheetAsPdf, writeInputValues } from '@/lib/sheetsEngine'
import { ensureYearMonthFolder, uploadPdfToDrive } from '@/lib/driveEngine'
import { sendRentEmail } from '@/lib/email'
import { markMonthlyTaskDone } from '@/lib/tasks'
import { amountToWordsPLN } from '@/lib/numberWords'

type InvoiceMappingEntry = { range: string; value: string }

function resolveInvoiceMapping(
  mapping: InvoiceMappingEntry[],
  vars: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of mapping) {
    const resolved = entry.value.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
    result[entry.range] = resolved
  }
  return result
}

export async function getRentPreview(month: number, year: number) {
  const supabase = createServiceClient()

  // Aktywne umowy BUSINESS bez rachunku RENT w tym miesiącu
  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('tenant_id')
    .eq('type', 'RENT')
    .eq('month', month)
    .eq('year', year)

  const existingTenantIds = (existingInvoices ?? []).map((i) => i.tenant_id)

  const { data: contracts } = await supabase
    .from('contracts')
    .select('*, tenants(id, first_name, last_name, email, nip, address1, address2, property_id)')
    .eq('is_active', true)
    .eq('contract_type', 'BUSINESS')
    .not('tenant_id', 'in', existingTenantIds.length ? `(${existingTenantIds.join(',')})` : '(-1)')

  const withEmail: typeof contracts = []
  const withoutEmail: typeof contracts = []

  for (const contract of contracts ?? []) {
    const tenant = contract.tenants as { email?: string } | null
    if (tenant?.email) withEmail.push(contract)
    else withoutEmail.push(contract)
  }

  return { withEmail, withoutEmail }
}

export async function generateRents(month: number, year: number) {
  const supabase = createServiceClient()
  const { withEmail, withoutEmail } = await getRentPreview(month, year)
  const allContracts = [...(withEmail ?? []), ...(withoutEmail ?? [])]

  const { data: config } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 1)
    .single()

  const results: { invoiceNumber: string; tenantName: string }[] = []

  for (const contract of allContracts) {
    const tenant = contract.tenants as {
      id: number
      first_name: string
      last_name: string
      email?: string
      nip?: string | null
      address1?: string | null
      address2?: string | null
    } | null
    if (!tenant) continue

    const invoiceNumber = buildInvoiceNumber(
      month,
      year,
      contract.invoice_seq_number,
      'RENT',
    )

    const { error } = await supabase.from('invoices').upsert(
      {
        type: 'RENT',
        number: invoiceNumber,
        amount: contract.rent_amount,
        month,
        year,
        tenant_id: tenant.id,
      },
      { onConflict: 'tenant_id,type,month,year', ignoreDuplicates: true },
    )
    if (error) continue

    let pdfBuffer: Buffer | undefined

    if (config?.rent_invoice_spreadsheet_id) {
      try {
        const dueDate = new Date(Date.UTC(year, month, 10))
        const vars: Record<string, string> = {
          numer_rachunku: invoiceNumber,
          data_wystawienia: new Date(Date.UTC(year, month - 1, 1))
            .toLocaleDateString('pl-PL'),
          termin_platnosci: dueDate.toLocaleDateString('pl-PL'),
          najemca: `${tenant.first_name} ${tenant.last_name}`,
          adres_1: tenant.address1 ?? '',
          adres_2: tenant.address2 ?? '',
          nip: tenant.nip ?? '',
          miesiac: String(month),
          rok: String(year),
          kwota: String(contract.rent_amount),
          kwota_slownie: amountToWordsPLN(Number(contract.rent_amount)),
        }

        const rawMapping = config.rent_invoice_input_mapping_json as InvoiceMappingEntry[] | null
        if (rawMapping?.length) {
          const resolved = resolveInvoiceMapping(rawMapping, vars)
          // inputMapping: każdy named range mapuje sam na siebie
          const inputMapping = Object.fromEntries(Object.keys(resolved).map((k) => [k, k]))
          await writeInputValues(config.rent_invoice_spreadsheet_id, inputMapping, resolved)
          // Czas na przeliczenie arkusza
          await new Promise((r) => setTimeout(r, 2000))
        }

        pdfBuffer = await exportSheetAsPdf(
          config.rent_invoice_spreadsheet_id,
          config.rent_invoice_pdf_gid || undefined,
        )

        if (config.drive_invoices_folder_id && pdfBuffer) {
          const folder = await ensureYearMonthFolder(
            year,
            month,
            config.drive_invoices_folder_id,
          )
          await uploadPdfToDrive(
            `${invoiceNumber.replace(/\//g, '-')}.pdf`,
            pdfBuffer,
            folder,
          )
        }

        // Rate limiting między iteracjami
        await new Promise((r) => setTimeout(r, 4000))
      } catch {
        // PDF generowanie opcjonalne — kontynuuj bez niego
      }
    }

    if (tenant.email) {
      await sendRentEmail(
        tenant.email,
        `${tenant.first_name} ${tenant.last_name}`,
        invoiceNumber,
        contract.rent_amount,
        month,
        year,
        pdfBuffer,
      )
    }

    results.push({
      invoiceNumber,
      tenantName: `${tenant.first_name} ${tenant.last_name}`,
    })
  }

  await markMonthlyTaskDone('RENT', month, year)
  revalidatePath('/finance')

  return results
}

export async function getRentInvoices(month: number, year: number) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('*, tenants(first_name, last_name)')
    .eq('type', 'RENT')
    .eq('month', month)
    .eq('year', year)
    .order('number')
  if (error) throw error
  return data
}
