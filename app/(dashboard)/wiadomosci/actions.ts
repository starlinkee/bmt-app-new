'use server'

import { createServiceClient } from '@/lib/supabase/service'

export async function getEmailLogs() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('email_logs')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('Błąd pobierania logów:', error)
    return []
  }
  return data
}
