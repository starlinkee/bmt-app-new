'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

export async function getContracts() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('contracts')
    .select('*, tenants(first_name, last_name, properties(name))')
    .order('is_active', { ascending: false })
  if (error) throw error
  return data
}

export async function createContract(data: {
  contract_type: string
  rent_amount: number
  invoice_seq_number: number
  has_media_invoice: boolean
  media_invoice_seq_number?: number | null
  opis_rachunku: string
  opis_rachunku_media: string
  start_date: string
  end_date?: string
  is_active: boolean
  tenant_id: number
}) {
  const supabase = createServiceClient()
  const { data: created, error } = await supabase.from('contracts').insert(data).select().single()
  if (error) {
    await logAudit({ actionName: 'createContract', tableName: 'contracts', operation: 'CREATE', errorData: error })
    throw error
  }
  await logAudit({ actionName: 'createContract', tableName: 'contracts', operation: 'CREATE', recordId: created.id, afterData: created })
  revalidatePath('/contracts')
}

export async function updateContract(
  id: number,
  data: Partial<{
    contract_type: string
    rent_amount: number
    invoice_seq_number: number
    has_media_invoice: boolean
    media_invoice_seq_number: number | null
    opis_rachunku: string
    opis_rachunku_media: string
    start_date: string
    end_date: string
    is_active: boolean
  }>,
) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('contracts').select('*').eq('id', id).single()
  const { data: after, error } = await supabase.from('contracts').update(data).eq('id', id).select().single()
  if (error) {
    await logAudit({ actionName: 'updateContract', tableName: 'contracts', operation: 'UPDATE', recordId: id, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'updateContract', tableName: 'contracts', operation: 'UPDATE', recordId: id, beforeData: before, afterData: after })
  revalidatePath('/contracts')
}

export async function deleteContract(id: number) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('contracts').select('*').eq('id', id).single()
  const { error } = await supabase.from('contracts').delete().eq('id', id)
  if (error) {
    await logAudit({ actionName: 'deleteContract', tableName: 'contracts', operation: 'DELETE', recordId: id, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'deleteContract', tableName: 'contracts', operation: 'DELETE', recordId: id, beforeData: before })
  revalidatePath('/contracts')
}

export async function revaluateContract(id: number, inflationPercent: number) {
  const supabase = createServiceClient()
  const { data: before, error: fetchError } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError
  const newRent = Math.round(Number(before.rent_amount) * (1 + inflationPercent / 100))
  const { data: after, error } = await supabase
    .from('contracts')
    .update({ rent_amount: newRent })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    await logAudit({ actionName: 'revaluateContract', tableName: 'contracts', operation: 'UPDATE', recordId: id, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'revaluateContract', tableName: 'contracts', operation: 'UPDATE', recordId: id, beforeData: before, afterData: after })
  revalidatePath('/contracts')
  return newRent
}
