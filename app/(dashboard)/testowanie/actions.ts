'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getSettlementGroup } from '@/app/(dashboard)/media/actions'
import { tenantDisplayName } from '@/lib/utils'

export async function generateTestMediaCharge(
  groupId: number,
  amount: number,
  month: number,
  year: number
) {
  const supabase = createServiceClient()

  // Pobierz grupę i mapowanie
  const group = await getSettlementGroup(groupId)
  if (!group) throw new Error('Nie znaleziono grupy')

  const outputEntries = (group.output_mapping_json as { range: string; tenant_id: number; type: string }[]) || []
  
  if (outputEntries.length === 0) {
    throw new Error('Grupa nie ma przypisanych żadnych najemców w output_mapping_json')
  }

  // Upewnijmy się, że jest jakieś rozliczenie (settlement) żeby podpiąć faktury
  let { data: settlement } = await supabase
    .from('media_settlements')
    .select('id')
    .eq('group_id', groupId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle()

  if (!settlement) {
    const { data: newSettlement, error: settlementError } = await supabase
      .from('media_settlements')
      .insert({
        group_id: groupId,
        month,
        year,
        spreadsheet_id: 'TEST_MANUAL',
        drive_pdf_ids: []
      })
      .select('id')
      .single()
      
    if (settlementError) throw settlementError
    settlement = newSettlement
  }

  const tenantIds = [...new Set(outputEntries.map((e) => e.tenant_id))]
  const { data: tenants } = await supabase
    .from('tenants')
    .select('*, contracts(*)')
    .in('id', tenantIds)

  const tenantMap = Object.fromEntries((tenants ?? []).map((t) => [t.id, t]))

  let generatedCount = 0

  for (const entry of outputEntries) {
    const tenant = tenantMap[entry.tenant_id]
    if (!tenant) continue

    const activeContract = (tenant.contracts as { is_active: boolean; contract_type: string; has_media_invoice: boolean; id: number }[] | undefined)?.find(
      (c) => c.is_active && c.has_media_invoice
    )

    if (!activeContract) continue

    // Tworzenie obciążenia w bazie
    const { error } = await supabase.from('invoices').upsert(
      {
        type: entry.type || 'MEDIA',
        number: null,
        amount,
        month,
        year,
        tenant_id: tenant.id,
        contract_id: activeContract.id,
        media_settlement_id: settlement.id,
      },
      { ignoreDuplicates: false }
    )
    
    if (error) {
      console.error('Błąd dodawania testowej noty', error)
      throw new Error('Błąd podczas zapisywania w bazie')
    }
    
    generatedCount++
  }

  return { success: true, count: generatedCount }
}
