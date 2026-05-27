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

export async function addManualBankTransaction(
  tenantId: number,
  amount: number,
  description: string,
  date: string,
) {
  const supabase = createServiceClient()
  await supabase.from('transactions').insert({
    type: 'BANK',
    status: 'MANUAL',
    amount,
    date,
    title: description,
    tenant_id: tenantId,
  })
  revalidatePath(`/tenants/${tenantId}`)
}

export async function updateTransaction(
  txId: number,
  tenantId: number,
  data: { amount: number; title: string; date: string },
  note?: string,
) {
  const supabase = createServiceClient()

  const { data: current } = await supabase
    .from('transactions')
    .select('amount, title, date, type, status')
    .eq('id', txId)
    .single()

  if (!current) throw new Error('Transaction not found')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('transaction_amendments').insert({
    transaction_id: txId,
    before_data: { amount: current.amount, title: current.title, date: current.date },
    after_data: { amount: data.amount, title: data.title, date: data.date },
    note: note ?? null,
  })

  await supabase
    .from('transactions')
    .update({ amount: data.amount, title: data.title, date: data.date })
    .eq('id', txId)

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
