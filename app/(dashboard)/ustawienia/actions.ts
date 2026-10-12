'use server'

import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { readAppConfigRow, updateAppConfig } from '@/lib/app-config'
import { requireUser } from '@/lib/auth-guard'

export async function getAppConfig() {
  await requireUser()
  return readAppConfigRow()
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
  const { user } = await requireUser()
  const before = await readAppConfigRow()
  // Przynajmniej jeden import musi zostać włączony (sprawdzane po scaleniu z obecną konfiguracją).
  const pekao = data.import_pekao_enabled ?? before?.import_pekao_enabled ?? true
  const millennium = data.import_millennium_enabled ?? before?.import_millennium_enabled ?? true
  if (!pekao && !millennium) {
    throw new Error('Przynajmniej jeden import musi być włączony.')
  }
  let after
  try {
    after = await updateAppConfig(data)
  } catch (error) {
    await logAudit({ ownerId: user.id, actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ ownerId: user.id, actionName: 'upsertAppConfig', tableName: 'app_config', operation: 'UPDATE', recordId: '1', beforeData: before, afterData: after })
  revalidatePath('/ustawienia')
  revalidatePath('/import')
  // Widoczność zakładki "Rozlicz w przeszłości" w menu zależy od app_config.
  revalidatePath('/', 'layout')
}
