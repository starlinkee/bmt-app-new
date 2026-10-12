'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth-guard'

export async function getMediaHistory() {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('media_settlements')
    .select('*, settlement_groups(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
