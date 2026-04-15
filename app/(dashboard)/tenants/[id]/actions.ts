'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

export async function addAdjustment(
  tenantId: number,
  amount: number,
  description: string,
  date: string,
) {
  const supabase = createServiceClient()
  await supabase.from('transactions').insert({
    type: 'ADJUSTMENT',
    status: 'MANUAL',
    amount,
    date,
    title: description,
    tenant_id: tenantId,
  })
  revalidatePath(`/tenants/${tenantId}`)
}
