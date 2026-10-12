'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth-guard'

export async function getAuditLogs() {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data
}
