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
  payment_account_1_name?: string
  payment_account_2_name?: string
  backfill_rents_enabled?: boolean
  import_pekao_enabled?: boolean
  import_millennium_enabled?: boolean
}) {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('app_config').select('*').eq('id', 1).single()
  // Przynajmniej jeden import musi zostać włączony (sprawdzane po scaleniu z obecną konfiguracją).
  const pekao = data.import_pekao_enabled ?? before?.import_pekao_enabled ?? true
  const millennium = data.import_millennium_enabled ?? before?.import_millennium_enabled ?? true
  if (!pekao && !millennium) {
    throw new Error('Przynajmniej jeden import musi być włączony.')
  }
  const { data: after, error } = await supabase.from('app_config').update(data).eq('id', 1).select().single()
  if (error) {
    await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, afterData: after })
  revalidatePath('/ustawienia')
  revalidatePath('/import')
  // Widoczność zakładki "Rozlicz w przeszłości" w menu zależy od app_config.
  revalidatePath('/', 'layout')
}
