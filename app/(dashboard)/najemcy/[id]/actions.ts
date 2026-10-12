'use server'

import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { getUserClient } from '@/lib/auth-guard'

// lib/statement i lib/balance czytają service clientem (omija RLS), więc najpierw
// sprawdzamy przez klienta z sesją, że najemca należy do zalogowanego konta.
// Obcy / nieistniejący tenantId -> 'Not found' i żadnych danych.
async function assertTenantOwned(
  supabase: Awaited<ReturnType<typeof getUserClient>>['supabase'],
  tenantId: number,
) {
  const { data } = await supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle()
  if (!data) throw new Error('Not found')
}

export async function getTenantStatement(tenantId: number) {
  const { supabase } = await getUserClient()
  await assertTenantOwned(supabase, tenantId)
  const { getStatement } = await import('@/lib/statement')
  return getStatement(tenantId)
}

export async function getTenantBalance(tenantId: number) {
  const { supabase } = await getUserClient()
  await assertTenantOwned(supabase, tenantId)
  const { calculateBalance } = await import('@/lib/balance')
  return calculateBalance(tenantId)
}

export async function addAdjustment(
  tenantId: number,
  amount: number,
  description: string,
  date: string,
) {
  const { user, supabase } = await getUserClient()
  const { data: created, error } = await supabase.from('transactions').insert({
    type: 'ADJUSTMENT',
    status: 'MANUAL',
    amount,
    date,
    title: description,
    tenant_id: tenantId,
  }).select().single()
  if (error) {
    await logAudit({ ownerId: user.id, actionName: 'addAdjustment', tableName: 'transactions', operation: 'CREATE', errorData: error })
    throw error
  }
  await logAudit({ ownerId: user.id, actionName: 'addAdjustment', tableName: 'transactions', operation: 'CREATE', recordId: created.id, afterData: created })
  revalidatePath(`/najemcy/${tenantId}`)
}

export async function addManualBankTransaction(
  tenantId: number,
  amount: number,
  description: string,
  date: string,
) {
  const { user, supabase } = await getUserClient()
  const { data: created, error } = await supabase.from('transactions').insert({
    type: 'BANK',
    status: 'MANUAL',
    amount,
    date,
    title: description,
    tenant_id: tenantId,
  }).select().single()
  if (error) {
    await logAudit({ ownerId: user.id, actionName: 'addManualBankTransaction', tableName: 'transactions', operation: 'CREATE', errorData: error })
    throw error
  }
  await logAudit({ ownerId: user.id, actionName: 'addManualBankTransaction', tableName: 'transactions', operation: 'CREATE', recordId: created.id, afterData: created })
  revalidatePath(`/najemcy/${tenantId}`)
}

export async function updateTransaction(
  txId: number,
  tenantId: number,
  data: { amount: number; title: string; date: string },
  note?: string,
) {
  const { user, supabase } = await getUserClient()

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
    await logAudit({ ownerId: user.id, actionName: 'updateTransaction', tableName: 'transactions', operation: 'UPDATE', recordId: txId, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ ownerId: user.id, actionName: 'updateTransaction', tableName: 'transactions', operation: 'UPDATE', recordId: txId, beforeData: before, afterData: after })

  revalidatePath(`/najemcy/${tenantId}`)
}

export async function getTransactionAmendments(txId: number) {
  const { supabase } = await getUserClient()
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
