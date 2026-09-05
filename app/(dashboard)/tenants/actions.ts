'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

export async function getTenants() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('*, properties(name), contracts(id, is_active, has_media_invoice)')
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
  company_name?: string
  email?: string
  email2?: string
  phone?: string
  bank_accounts_as_text?: string
  nip?: string
  address1?: string
  address2?: string
  property_id: number
  sender_account?: number
}) {
  const supabase = createServiceClient()
  const { data: created, error } = await supabase
    .from('tenants')
    .insert({ ...data, bank_accounts_as_text: data.bank_accounts_as_text ?? '' })
    .select()
    .single()
  if (error) {
    await logAudit({ actionName: 'createTenant', tableName: 'tenants', operation: 'CREATE', errorData: error })
    throw error
  }
  await logAudit({ actionName: 'createTenant', tableName: 'tenants', operation: 'CREATE', recordId: created.id, afterData: created })
  revalidatePath('/tenants')
}

export async function updateTenant(
  id: number,
  data: Partial<{
    tenant_type: string
    first_name: string
    last_name: string
    company_name: string
    email: string
    email2: string
    phone: string
    bank_accounts_as_text: string
    nip: string
    address1: string
    address2: string
    property_id: number
    sender_account: number
  }>,
) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('tenants').select('*').eq('id', id).single()
  const { data: after, error } = await supabase.from('tenants').update(data).eq('id', id).select().single()
  if (error) {
    await logAudit({ actionName: 'updateTenant', tableName: 'tenants', operation: 'UPDATE', recordId: id, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'updateTenant', tableName: 'tenants', operation: 'UPDATE', recordId: id, beforeData: before, afterData: after })
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

  const { data: before } = await supabase.from('tenants').select('*').eq('id', id).single()
  const { error } = await supabase.from('tenants').delete().eq('id', id)
  if (error) {
    await logAudit({ actionName: 'deleteTenant', tableName: 'tenants', operation: 'DELETE', recordId: id, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'deleteTenant', tableName: 'tenants', operation: 'DELETE', recordId: id, beforeData: before })
  revalidatePath('/tenants')
}
