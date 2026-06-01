'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { parseCsv } from '@/lib/csvParser'
import { matchTransaction } from '@/lib/matcher'
import { logAudit } from '@/lib/audit'

export async function importCsvTransactions(csvContent: string) {
  const supabase = createServiceClient()
  const { bank, transactions, skipped } = parseCsv(csvContent)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('transaction_staging').delete().neq('id', 0)

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, bank_accounts_as_text')

  let withSuggestion = 0
  let withoutSuggestion = 0
  let duplicates = 0

  for (const tx of transactions) {
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('date', tx.date)
      .eq('amount', tx.amount)
      .eq('type', 'BANK')
      .eq('bank_account', tx.bankAccount ?? '')

    const isDuplicate = (count ?? 0) > 0
    if (isDuplicate) duplicates++

    const tenant = matchTransaction(tx.bankAccount, tenants ?? [])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('transaction_staging').insert({
      amount: tx.amount,
      date: tx.date,
      title: tx.title,
      bank_account: tx.bankAccount,
      raw_data: tx.rawData ?? null,
      suggested_tenant_id: tenant ? tenant.id : null,
      is_duplicate: isDuplicate,
    })

    if (tenant) {
      withSuggestion++
    } else {
      withoutSuggestion++
    }
  }

  const summary = { bank, total: transactions.length, withSuggestion, withoutSuggestion, skipped, duplicates }
  await logAudit({
    actionName: 'importCsvTransactions',
    tableName: 'transaction_staging',
    operation: 'IMPORT',
    afterData: summary,
  })

  revalidatePath('/import')
  return summary
}

export async function getUnmatchedTransactions() {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('transaction_staging')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data as {
    id: number
    amount: number
    date: string
    title: string
    bank_account: string | null
    raw_data: Record<string, string> | null
    suggested_tenant_id: number | null
    is_duplicate: boolean
    created_at: string
  }[]
}

export async function reconcileTransaction(
  txId: number,
  tenantId: number,
  saveAccount: boolean,
  category?: 'RENT' | 'MEDIA',
) {
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staged } = await (supabase as any).from('transaction_staging')
    .select('*')
    .eq('id', txId)
    .single()

  if (!staged) throw new Error('Staging record not found')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error: insertError } = await (supabase.from('transactions') as any).insert({
    type: 'BANK',
    status: 'MATCHED',
    amount: staged.amount,
    date: staged.date,
    title: staged.title,
    bank_account: staged.bank_account,
    tenant_id: tenantId,
    raw_data: staged.raw_data,
    category: category ?? null,
  }).select().single()

  if (insertError) {
    await logAudit({ actionName: 'reconcileTransaction', tableName: 'transactions', operation: 'CREATE', errorData: insertError })
    throw insertError
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('transaction_staging').delete().eq('id', txId)

  await logAudit({
    actionName: 'reconcileTransaction',
    tableName: 'transactions',
    operation: 'CREATE',
    recordId: created?.id,
    afterData: created,
  })

  const tx = staged

  if (saveAccount && tx?.bank_account) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('bank_accounts_as_text')
      .eq('id', tenantId)
      .single()

    if (tenant) {
      const existing = tenant.bank_accounts_as_text ?? ''
      const normalize = (a: string) =>
        a.toUpperCase().replace(/^PL/i, '').replace(/[\s\-]/g, '')
      const newNorm = normalize(tx.bank_account)
      const alreadyExists = existing
        .split(/[\n,;]+/)
        .map((a) => normalize(a.trim()))
        .filter(Boolean)
        .some((a) => a === newNorm)
      const updated = alreadyExists
        ? existing
        : existing
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

export async function reconcileMany(
  items: { txId: number; tenantId: number; category?: 'RENT' | 'MEDIA' }[],
) {
  for (const { txId, tenantId, category } of items) {
    await reconcileTransaction(txId, tenantId, true, category)
  }
  revalidatePath('/import/reconcile')
}

export async function dismissTransaction(txId: number) {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: before } = await (supabase as any).from('transaction_staging').select('*').eq('id', txId).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('transaction_staging').delete().eq('id', txId)
  await logAudit({
    actionName: 'dismissTransaction',
    tableName: 'transaction_staging',
    operation: 'DISMISS',
    recordId: txId,
    beforeData: before,
  })
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

export async function updateTransactionCategory(txId: number, category: 'RENT' | 'MEDIA') {
  const supabase = createServiceClient()
  const { data: before } = await supabase.from('transactions').select('*').eq('id', txId).single()
  const { data: after, error } = await supabase
    .from('transactions')
    .update({ category })
    .eq('id', txId)
    .select()
    .single()
  if (error) {
    await logAudit({ actionName: 'updateTransactionCategory', tableName: 'transactions', operation: 'UPDATE', recordId: txId, beforeData: before, errorData: error })
    throw error
  }
  await logAudit({ actionName: 'updateTransactionCategory', tableName: 'transactions', operation: 'UPDATE', recordId: txId, beforeData: before, afterData: after })
  revalidatePath('/import/history')
}
