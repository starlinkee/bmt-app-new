'use server'

import { getUserClient } from '@/lib/auth-guard'

export async function getMediaHistory() {
  const { supabase } = await getUserClient()
  const { data, error } = await supabase
    .from('media_settlements')
    .select('*, settlement_groups(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
