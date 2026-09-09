'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

export async function getTenants() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('*, properties(name), contracts(id, is_active, has_media_invoice, rent_amount)')
    .order('last_name')
  if (error) throw error

  // Dolicz liczbę mediów skonfigurowanych do podania przez najemcę (tenant_reading_keys
  // w grupach rozliczeniowych powiązanych z nieruchomością najemcy) - potrzebne, żeby
  // link do odczytów pokazywał się tylko wtedy, gdy najemca faktycznie ma co podać.
  const propertyIds = Array.from(
    new Set((data ?? []).map((t) => t.property_id).filter((id): id is number => id != null)),
  )

  const readingKeysCountByTenant: Record<number, number> = {}
  if (propertyIds.length > 0) {
    const { data: sgp } = await supabase
      .from('settlement_group_properties')
      .select('property_id, settlement_group_id')
      .in('property_id', propertyIds)

    const groupIds = Array.from(new Set((sgp ?? []).map((s) => s.settlement_group_id)))

    if (groupIds.length > 0) {
      const { data: groups } = await supabase
        .from('settlement_groups')
        .select('id, tenant_reading_keys')
        .in('id', groupIds)

      const readingKeysByGroup = new Map(
        (groups ?? []).map((g) => [g.id, g.tenant_reading_keys as Record<string, unknown[]> | null]),
      )
      const groupIdsByProperty = new Map<number, number[]>()
      for (const row of sgp ?? []) {
        const list = groupIdsByProperty.get(row.property_id) ?? []
        list.push(row.settlement_group_id)
        groupIdsByProperty.set(row.property_id, list)
      }

      for (const t of data ?? []) {
        if (t.property_id == null) continue
        let count = 0
        for (const gid of groupIdsByProperty.get(t.property_id) ?? []) {
          const keys = readingKeysByGroup.get(gid)?.[t.id.toString()]
          if (Array.isArray(keys)) count += keys.length
        }
        readingKeysCountByTenant[t.id] = count
      }
    }
  }

  return (data ?? []).map((t) => ({
    ...t,
    reading_keys_count: readingKeysCountByTenant[t.id] ?? 0,
  }))
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
  revalidatePath('/najemcy')
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
  revalidatePath('/najemcy')
  revalidatePath(`/najemcy/${id}`)
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
  revalidatePath('/najemcy')
}
