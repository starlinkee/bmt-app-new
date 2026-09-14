'use server'

import { createServiceClient } from '@/lib/supabase/service'

export async function getMediaHistory() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('media_settlements')
    .select('*, settlement_groups(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
