'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

export async function getAppConfig() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 1)
    .single()
  return data
}

export async function upsertAppConfig(data: {
  ignored_source_accounts?: string
  admin_email?: string | null
}) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('app_config').select('*').eq('id', 1).single()
  const { data: after, error } = await supabase.from('app_config').update(data).eq('id', 1).select().single()
  if (error) {
    await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, afterData: after })
  revalidatePath('/ustawienia')
}
