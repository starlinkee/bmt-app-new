'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

export async function getProperties() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('properties')
    .select('*, tenants(count)')
    .order('name')
  if (error) throw error
  return data
}

export async function createProperty(data: {
  name: string
  address1: string
  address2?: string
  type: string
}) {
  const supabase = createServiceClient()
  const { error } = await supabase.from('properties').insert(data)
  if (error) throw error
  revalidatePath('/properties')
}

export async function updateProperty(
  id: number,
  data: { name?: string; address1?: string; address2?: string; type?: string },
) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('properties')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/properties')
}

export async function deleteProperty(id: number) {
  const supabase = createServiceClient()
  // Sprawdź czy ma najemców
  const { count } = await supabase
    .from('tenants')
    .select('*', { count: 'exact', head: true })
    .eq('property_id', id)

  if ((count ?? 0) > 0) {
    return { error: 'Nie można usunąć nieruchomości z przypisanymi najemcami.' }
  }

  const { error } = await supabase.from('properties').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/properties')
}
