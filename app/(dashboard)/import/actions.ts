'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { parseCsv } from '@/lib/csvParser'
import { matchTransaction } from '@/lib/matcher'

export async function importCsvTransactions(csvContent: string) {
  const supabase = createServiceClient()
  const { bank, transactions, skipped } = parseCsv(csvContent)

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, bank_accounts_as_text')

  let matched = 0
  let unmatched = 0

  for (const tx of transactions) {
    const tenant = matchTransaction(tx.bankAccount, tenants ?? [])
    const status = tenant ? 'MATCHED' : 'UNMATCHED'
    if (tenant) matched++
    else unmatched++

    await supabase.from('transactions').insert({
      type: 'BANK',
      status,
      amount: tx.amount,
      date: tx.date,
      title: tx.title,
      bank_account: tx.bankAccount,
      tenant_id: tenant?.id ?? null,
    })
  }

  revalidatePath('/import')
  return { bank, total: transactions.length, matched, unmatched, skipped }
}

export async function getUnmatchedTransactions() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('status', 'UNMATCHED')
    .eq('type', 'BANK')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function reconcileTransaction(
  txId: number,
  tenantId: number,
  saveAccount: boolean,
) {
  const supabase = createServiceClient()

  const { data: tx } = await supabase
    .from('transactions')
    .select('bank_account')
    .eq('id', txId)
    .single()

  await supabase
    .from('transactions')
    .update({ status: 'MATCHED', tenant_id: tenantId })
    .eq('id', txId)

  if (saveAccount && tx?.bank_account) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('bank_accounts_as_text')
      .eq('id', tenantId)
      .single()

    if (tenant) {
      const existing = tenant.bank_accounts_as_text ?? ''
      const updated = existing
        ? `${existing}\n${tx.bank_account}`
        : tx.bank_account

      await supabase
        .from('tenants')
        .update({ bank_accounts_as_text: updated })
        .eq('id', tenantId)
    }
  }

  revalidatePath('/import/reconcile')
}

export async function dismissTransaction(txId: number) {
  const supabase = createServiceClient()
  await supabase
    .from('transactions')
    .update({ status: 'DISMISSED' })
    .eq('id', txId)
  revalidatePath('/import/reconcile')
}
