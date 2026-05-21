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
  let duplicates = 0

  for (const tx of transactions) {
    // Pomiń duplikaty: ta sama data + kwota + numer konta już w bazie
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('date', tx.date)
      .eq('amount', tx.amount)
      .eq('type', 'BANK')
      .eq('bank_account', tx.bankAccount ?? '')

    if ((count ?? 0) > 0) {
      duplicates++
      continue
    }

    const tenant = matchTransaction(tx.bankAccount, tenants ?? [])
    const status = tenant ? 'MATCHED' : 'UNMATCHED'
    if (tenant) matched++
    else unmatched++

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('transactions') as any).insert({
      type: 'BANK',
      status,
      amount: tx.amount,
      date: tx.date,
      title: tx.title,
      bank_account: tx.bankAccount,
      tenant_id: tenant?.id ?? null,
      raw_data: tx.rawData ?? null,
    })
  }

  revalidatePath('/import')
  return { bank, total: transactions.length, matched, unmatched, skipped, duplicates }
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

export async function getAllTransactions(status?: string) {
  const supabase = createServiceClient()
  let query = supabase
    .from('transactions')
    .select('*, tenants(first_name, last_name)')
    .eq('type', 'BANK')
    .order('date', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}
