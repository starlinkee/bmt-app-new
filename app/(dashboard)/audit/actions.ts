'use server'

import { createServiceClient } from '@/lib/supabase/service'

export async function getAuditLogs() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data
}
