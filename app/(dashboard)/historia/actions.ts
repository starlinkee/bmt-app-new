'use server'

import { getUserClient } from '@/lib/auth-guard'

export async function getAuditLogs() {
  const { supabase } = await getUserClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data
}
