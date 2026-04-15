'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import {
  writeInputValues,
  triggerRecalc,
  readOutputValues,
  exportSheetAsPdf,
} from '@/lib/sheetsEngine'
import { ensureYearMonthFolder, uploadPdfToDrive } from '@/lib/driveEngine'
import { sendMediaEmail } from '@/lib/email'
import { buildInvoiceNumber } from '@/lib/utils'
import { markMonthlyTaskDone } from '@/lib/tasks'

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

  revalidatePath('/media')
}

export async function updateSettlementGroup(
  id: number,
  data: {
    name?: string
    spreadsheet_id?: string
    input_mapping_json?: Record<string, string>
    output_mapping_json?: Record<string, string>
    property_ids?: number[]
  },
) {
  const supabase = createServiceClient()
  const { property_ids, ...rest } = data

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

export async function processSettlement(
  groupId: number,
  inputValues: Record<string, string | number>,
  month: number,
  year: number,
) {
  const supabase = createServiceClient()

  const group = await getSettlementGroup(groupId)
  if (!group) throw new Error('Grupa nie istnieje')

  // 1. Zapisz odczyty do arkusza
  await writeInputValues(
    group.spreadsheet_id,
    group.input_mapping_json as Record<string, string>,
    inputValues,
  )

  // 2. Wymuś przeliczenie
  await triggerRecalc(group.spreadsheet_id)
  // Czekaj chwilę na przeliczenie
  await new Promise((r) => setTimeout(r, 2000))

  // 3. Odczytaj wyniki
  const outputs = await readOutputValues(
    group.spreadsheet_id,
    group.output_mapping_json as Record<string, string>,
  )

  const { data: config } = await supabase
    .from('app_config')
    .select('drive_invoices_folder_id')
    .eq('id', 1)
    .single()

  const results: { tenantName: string; amount: number; invoiceNumber: string }[] = []

  // 4. Utwórz rachunki dla najemców z nieruchomości w grupie
  const propertyIds = group.settlement_group_properties?.map(
    (sgp: { property_id: number }) => sgp.property_id,
  ) ?? []

  const { data: tenants } = await supabase
    .from('tenants')
    .select('*, contracts(*)')
    .in('property_id', propertyIds)

  for (const tenant of tenants ?? []) {
    const amountStr = outputs[`${tenant.first_name} ${tenant.last_name}`]
      ?? outputs[String(tenant.id)]
    const amount = parseFloat(amountStr?.replace(',', '.') ?? '0')
    if (!amount || amount <= 0) continue

    const activeContract = tenant.contracts?.find(
      (c: { is_active: boolean; contract_type: string }) =>
        c.is_active && c.contract_type === 'BUSINESS',
    )
    if (!activeContract) continue

    const invoiceNumber = buildInvoiceNumber(
      month,
      year,
      activeContract.invoice_seq_number,
      'MEDIA',
    )

    const { error } = await supabase.from('invoices').upsert(
      {
        type: 'MEDIA',
        number: invoiceNumber,
        amount,
        month,
        year,
        tenant_id: tenant.id,
      },
      { onConflict: 'tenant_id,type,month,year', ignoreDuplicates: true },
    )
    if (error) continue

    if (tenant.email) {
      await sendMediaEmail(
        tenant.email,
        `${tenant.first_name} ${tenant.last_name}`,
        invoiceNumber,
        amount,
        month,
        year,
      )
    }

    results.push({
      tenantName: `${tenant.first_name} ${tenant.last_name}`,
      amount,
      invoiceNumber,
    })
  }

  await markMonthlyTaskDone('MEDIA', month, year)
  revalidatePath(`/media/${groupId}`)

  return results
}
