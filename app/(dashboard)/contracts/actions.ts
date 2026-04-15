'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

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
  start_date: string
  end_date?: string
  is_active: boolean
  tenant_id: number
}) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('contracts').insert(data)
  if (error) throw error
  revalidatePath('/contracts')
}

export async function updateContract(
  id: number,
  data: Partial<{
    contract_type: string
    rent_amount: number
    invoice_seq_number: number
    start_date: string
    end_date: string
    is_active: boolean
  }>,
) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('contracts').update(data).eq('id', id)
  if (error) throw error
  revalidatePath('/contracts')
}

export async function deleteContract(id: number) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('contracts').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/contracts')
}
