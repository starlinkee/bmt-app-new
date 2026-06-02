'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { buildInvoiceNumber, tenantDisplayName } from '@/lib/utils'
import { exportSheetAsPdf, writeInputValues, stripSpreadsheetColors, getServiceAccountEmail } from '@/lib/sheetsEngine'
import { ensureYearMonthFolder, uploadPdfToDrive, copySpreadsheet } from '@/lib/driveEngine'
import { sendRentEmail } from '@/lib/email'
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
    .select('contract_id')
    .eq('type', 'RENT')
    .eq('month', month)
    .eq('year', year)
    .not('contract_id', 'is', null)

  const existingContractIds = (existingInvoices ?? []).map((i) => i.contract_id).filter(Boolean)

  const [contractsResult, appConfigResult] = await Promise.all([
    supabase
      .from('contracts')
      .select('*, tenants(id, first_name, last_name, tenant_type, company_name, email, email2, nip, address1, address2, property_id, sender_account)')
      .eq('is_active', true)
      .eq('contract_type', 'BUSINESS')
      .not('id', 'in', existingContractIds.length ? `(${existingContractIds.join(',')})` : '(-1)'),
    supabase
      .from('app_config')
      .select('gmail_user, gmail_user_2')
      .eq('id', 1)
      .single(),
  ])

  const contracts = contractsResult.data
  const withEmail: typeof contracts = []
  const withoutEmail: typeof contracts = []

  for (const contract of contracts ?? []) {
    const tenant = contract.tenants as { email?: string } | null
    if (tenant?.email) withEmail.push(contract)
    else withoutEmail.push(contract)
  }

  return {
    withEmail,
    withoutEmail,
    senderEmail1: appConfigResult.data?.gmail_user ?? null,
    senderEmail2: appConfigResult.data?.gmail_user_2 ?? null,
  }
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

  let monthFolder: string | undefined
  if (config?.drive_invoices_folder_id) {
    try {
      monthFolder = await ensureYearMonthFolder(year, month, config.drive_invoices_folder_id)
    } catch {
      // folder opcjonalny
    }
  }

  // Pre-przydziel numery faktur przed wejściem w równoległość
  const assignedContracts = allContracts.map((contract, ci) => ({
    contract,
    invoiceNumber: buildInvoiceNumber(month, year, ci + 1),
  }))

  type RentResult = { invoiceNumber: string; tenantName: string }

  const settled = await Promise.allSettled(
    assignedContracts.map(async ({ contract, invoiceNumber }) => {
      const tenant = contract.tenants as {
        id: number
        first_name: string
        last_name: string
        tenant_type?: string | null
        company_name?: string | null
        email?: string
        nip?: string | null
        address1?: string | null
        address2?: string | null
        sender_account?: number | null
      } | null
      if (!tenant) return null

      const { error } = await supabase.from('invoices').upsert(
        {
          type: 'RENT',
          number: invoiceNumber,
          amount: contract.rent_amount,
          month,
          year,
          tenant_id: tenant.id,
          contract_id: contract.id,
        },
        { ignoreDuplicates: true },
      )
      if (error) return null

      let pdfBuffer: Buffer | undefined

      if (config?.rent_invoice_spreadsheet_id && monthFolder) {
        try {
          const dueDate = new Date(Date.UTC(year, month - 1, 10))
          const vars: Record<string, string> = {
            numer_rachunku: invoiceNumber,
            data_wystawienia: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('pl-PL'),
            termin_platnosci: dueDate.toLocaleDateString('pl-PL'),
            najemca: tenantDisplayName(tenant),
            adres_1: tenant.address1 ?? '',
            adres_2: tenant.address2 ?? '',
            nip: tenant.nip ?? '',
            miesiac: String(month),
            rok: String(year),
            kwota: String(contract.rent_amount),
            kwota_slownie: amountToWordsPLN(Number(contract.rent_amount)),
            opis_rachunku: (contract as Record<string, unknown>).opis_rachunku as string ?? '',
          }

          const invoiceName = `Rachunek ${invoiceNumber.replace(/\//g, '-')} – ${tenantDisplayName(tenant)}`
          const invoiceSheetId = await copySpreadsheet(
            config.rent_invoice_spreadsheet_id,
            invoiceName,
            monthFolder,
            getServiceAccountEmail(),
          )
          await stripSpreadsheetColors(invoiceSheetId)

          const rawMapping = config?.rent_invoice_input_mapping_json as InvoiceMappingEntry[] | null
          if (rawMapping?.length) {
            const resolved = resolveInvoiceMapping(rawMapping, vars)
            const inputMapping = Object.fromEntries(Object.keys(resolved).map((k) => [k, k]))
            await writeInputValues(invoiceSheetId, inputMapping, resolved)
          }

          pdfBuffer = await exportSheetAsPdf(invoiceSheetId, config?.rent_invoice_pdf_gid || undefined)

          if (pdfBuffer) {
            await uploadPdfToDrive(
              `${invoiceNumber.replace(/\//g, '-')}.pdf`,
              pdfBuffer,
              monthFolder,
            )
          }
        } catch {
          // PDF generowanie opcjonalne — kontynuuj bez niego
        }
      }

      if (tenant.email) {
        const recipients = [tenant.email, (tenant as unknown as { email2?: string | null }).email2].filter(Boolean) as string[]
        const senderAccount = (tenant.sender_account ?? 1) === 2 ? 2 : 1
        await sendRentEmail(
          recipients,
          tenantDisplayName(tenant),
          invoiceNumber,
          contract.rent_amount,
          month,
          year,
          pdfBuffer,
          senderAccount,
        )
      }

      return { invoiceNumber, tenantName: tenantDisplayName(tenant) } satisfies RentResult
    }),
  )

  const results = settled.reduce<RentResult[]>((acc, r) => {
    if (r.status === 'fulfilled' && r.value !== null) acc.push(r.value)
    return acc
  }, [])

  await logAudit({
    actionName: 'generateRents',
    tableName: 'invoices',
    operation: 'UPSERT',
    afterData: { month, year, count: results.length, results },
  })
  revalidatePath('/finance')

  return results
}

export async function getRentInvoices(month: number, year: number) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('*, tenants(first_name, last_name, tenant_type, company_name)')
    .eq('type', 'RENT')
    .eq('month', month)
    .eq('year', year)
    .order('number')
  if (error) throw error
  return data
}
