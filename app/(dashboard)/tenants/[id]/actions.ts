'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

export async function addAdjustment(
  tenantId: number,
  amount: number,
  description: string,
  date: string,
) {
  const supabase = createServiceClient()
  const { data: created, error } = await supabase.from('transactions').insert({
    type: 'ADJUSTMENT',
    status: 'MANUAL',
    amount,
    date,
    title: description,
    tenant_id: tenantId,
  }).select().single()
  if (error) {
    await logAudit({ actionName: 'addAdjustment', tableName: 'transactions', operation: 'CREATE', errorData: error })
    throw error
  }
  await logAudit({ actionName: 'addAdjustment', tableName: 'transactions', operation: 'CREATE', recordId: created.id, afterData: created })
  revalidatePath(`/tenants/${tenantId}`)
}

export async function addManualBankTransaction(
  tenantId: number,
  amount: number,
  description: string,
  date: string,
) {
  const supabase = createServiceClient()
  const { data: created, error } = await supabase.from('transactions').insert({
    type: 'BANK',
    status: 'MANUAL',
    amount,
    date,
    title: description,
    tenant_id: tenantId,
  }).select().single()
  if (error) {
    await logAudit({ actionName: 'addManualBankTransaction', tableName: 'transactions', operation: 'CREATE', errorData: error })
    throw error
  }
  await logAudit({ actionName: 'addManualBankTransaction', tableName: 'transactions', operation: 'CREATE', recordId: created.id, afterData: created })
  revalidatePath(`/tenants/${tenantId}`)
}

export async function updateTransaction(
  txId: number,
  tenantId: number,
  data: { amount: number; title: string; date: string },
  note?: string,
) {
  const supabase = createServiceClient()

  const { data: before } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', txId)
    .single()

  if (!before) throw new Error('Transaction not found')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('transaction_amendments').insert({
    transaction_id: txId,
    before_data: { amount: before.amount, title: before.title, date: before.date },
    after_data: { amount: data.amount, title: data.title, date: data.date },
    note: note ?? null,
  })

  const { data: after, error } = await supabase
    .from('transactions')
    .update({ amount: data.amount, title: data.title, date: data.date })
    .eq('id', txId)
    .select()
    .single()

  if (error) {
    await logAudit({ actionName: 'updateTransaction', tableName: 'transactions', operation: 'UPDATE', recordId: txId, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'updateTransaction', tableName: 'transactions', operation: 'UPDATE', recordId: txId, beforeData: before, afterData: after })

  revalidatePath(`/tenants/${tenantId}`)
}

export async function getTransactionAmendments(txId: number) {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('transaction_amendments')
    .select('*')
    .eq('transaction_id', txId)
    .order('amended_at', { ascending: false })
  if (error) throw error
  return data as {
    id: number
    transaction_id: number
    before_data: { amount: number; title: string; date: string }
    after_data: { amount: number; title: string; date: string }
    amended_at: string
    note: string | null
  }[]
}
