'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

export async function getTenants() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('*, properties(name), contracts(count)')
    .order('last_name')
  if (error) throw error
  return data
}

export async function getTenant(id: number) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('*, properties(*), contracts(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createTenant(data: {
  tenant_type: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  bank_accounts_as_text?: string
  nip?: string
  address1?: string
  address2?: string
  property_id: number
}) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('tenants').insert({
    ...data,
    bank_accounts_as_text: data.bank_accounts_as_text ?? '',
  })
  if (error) throw error
  revalidatePath('/tenants')
}

export async function updateTenant(
  id: number,
  data: Partial<{
    tenant_type: string
    first_name: string
    last_name: string
    email: string
    phone: string
    bank_accounts_as_text: string
    nip: string
    address1: string
    address2: string
    property_id: number
  }>,
) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('tenants').update(data).eq('id', id)
  if (error) throw error
  revalidatePath('/tenants')
  revalidatePath(`/tenants/${id}`)
}

export async function deleteTenant(id: number) {
  const supabase = createServiceClient()
  const { count } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', id)

  if ((count ?? 0) > 0) {
    return { error: 'Nie można usunąć najemcy z aktywnymi umowami.' }
  }

  const { error } = await supabase.from('tenants').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/tenants')
}
