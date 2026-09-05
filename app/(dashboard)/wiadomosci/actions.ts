'use server'

import { createServiceClient } from '@/lib/supabase/service'

export async function getEmailLogs(params?: {
  dateFrom?: string
  dateTo?: string
  recipient?: string
}) {
  const supabase = createServiceClient()
  let query = supabase
    .from('email_logs')
    .select('*')
    .order('sent_at', { ascending: false })

  if (params?.dateFrom) {
    query = query.gte('sent_at', params.dateFrom)
  }
  if (params?.dateTo) {
    query = query.lte('sent_at', params.dateTo + 'T23:59:59.999Z')
  }
  if (params?.recipient) {
    query = query.ilike('to_email', `%${params.recipient}%`)
  }

  const { data, error } = await query.limit(200)

  if (error) {
    console.error('Błąd pobierania logów:', error)
    return []
  }
  return data
}
