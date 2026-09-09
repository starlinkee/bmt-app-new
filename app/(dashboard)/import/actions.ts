'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { parseCsv } from '@/lib/csvParser'
import { parsePdf } from '@/lib/pdfParser'
import { matchTransaction } from '@/lib/matcher'
import { logAudit } from '@/lib/audit'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export async function importBankStatement(
  content: string,
  fileName: string = 'unknown.csv',
  dayFrom?: number,
  dayTo?: number,
  pdfSlot?: 1 | 2,
) {
  const supabase = createServiceClient()

  let parseResult;
  if (fileName.toLowerCase().endsWith('.pdf')) {
    // If it's a base64 string from readAsDataURL, strip the prefix
    const base64Data = content.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    parseResult = await parsePdf(buffer);
  } else {
    parseResult = parseCsv(content);
  }

  const { bank } = parseResult
  let { transactions, skippedTransactions, skipped } = parseResult

  // Opcjonalne przycięcie do dnia miesiąca — pozwala wgrać dwa pokrywające się
  // wyciągi (np. cały poprzedni i cały bieżący miesiąc) bez duplikowania tych
  // samych transakcji: jeden plik ogranicza się np. od 16. dnia, drugi do 15.
  // Zakres dotyczy dnia miesiąca (1-31), nie konkretnej daty — użytkownik sam
  // wie, ile dni ma dany miesiąc.
  if (dayFrom || dayTo) {
    const dayOf = (d: string) => Number(d.slice(8, 10))
    const inRange = (d: string) => {
      const day = dayOf(d)
      return (!dayFrom || day >= dayFrom) && (!dayTo || day <= dayTo)
    }
    const outOfRangeCount = transactions.filter((tx) => !inRange(tx.date)).length
    transactions = transactions.filter((tx) => inRange(tx.date))
    skippedTransactions = skippedTransactions.filter((tx) => inRange(tx.date))
    skipped += outOfRangeCount
  }

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, bank_accounts_as_text')

  let withSuggestion = 0
  let withoutSuggestion = 0
  let duplicates = 0
  let minDate = '9999-12-31'
  let maxDate = '0000-01-01'

  const { data: config } = await supabase.from('app_config').select('ignored_source_accounts').eq('id', 1).single()
  const ignoredAccountsList = config?.ignored_source_accounts
    ? config.ignored_source_accounts.split('\n').map((a: string) => a.trim().replace(/\s/g, '')).filter(Boolean)
    : []

  if (skippedTransactions && skippedTransactions.length > 0) {
    const toInsertSkipped = skippedTransactions.map(tx => {
      const txAccountNorm = tx.bankAccount ? tx.bankAccount.replace(/\s/g, '') : ''
      const isIgnored = txAccountNorm && ignoredAccountsList.some((acc: string) => txAccountNorm.includes(acc) || acc.includes(txAccountNorm))
      
      return {
        date: tx.date,
        title: tx.title,
        amount: tx.amount,
        bank_account: tx.bankAccount ?? '',
        type: 'BANK',
        tenant_id: null,
        status: isIgnored ? 'REJECTED_OWN_TRANSFER' : 'SKIPPED',
        category: null,
        raw_data: tx.rawData,
      }
    })
    await supabase.from('transactions').insert(toInsertSkipped)
  }

  for (const tx of transactions) {
    if (tx.date < minDate) minDate = tx.date
    if (tx.date > maxDate) maxDate = tx.date

    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('date', tx.date)
      .eq('amount', tx.amount)
      .eq('type', 'BANK')
      .eq('bank_account', tx.bankAccount ?? '')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: stagingCount } = await (supabase as any)
      .from('transaction_staging')
      .select('*', { count: 'exact', head: true })
      .eq('date', tx.date)
      .eq('amount', tx.amount)
      .eq('bank_account', tx.bankAccount ?? '')

    const isDuplicate = (count ?? 0) > 0 || (stagingCount ?? 0) > 0
    if (isDuplicate) duplicates++

    const txAccountNorm = tx.bankAccount ? tx.bankAccount.replace(/\s/g, '') : ''
    let suggestedTenantId = null
    let autoReject = false

    if (tx.amount <= 0) {
      autoReject = true
    } else if (txAccountNorm && ignoredAccountsList.some((acc: string) => txAccountNorm.includes(acc) || acc.includes(txAccountNorm))) {
      autoReject = true
    } else if (isDuplicate) {
      autoReject = true
    } else {
      const tenant = matchTransaction(tx.bankAccount, tenants ?? [])
      if (tenant) {
        suggestedTenantId = tenant.id
      }
    }

    const rawDataWithFlag = tx.rawData ? { ...tx.rawData } : {}
    if (autoReject) {
      // @ts-ignore
      rawDataWithFlag._auto_reject = true
      if (isDuplicate) {
        // @ts-ignore
        rawDataWithFlag._auto_reject_reason = 'duplicate'
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any).from('transaction_staging').insert({
      amount: tx.amount,
      date: tx.date,
      title: tx.title,
      bank_account: tx.bankAccount,
      raw_data: Object.keys(rawDataWithFlag).length > 0 ? rawDataWithFlag : null,
      suggested_tenant_id: suggestedTenantId,
      is_duplicate: isDuplicate,
    })
    
    if (insertError) {
      console.error('Failed to insert tx into staging:', insertError)
    }

    if (suggestedTenantId !== null) {
      withSuggestion++
    } else {
      withoutSuggestion++
    }
  }

  const attachDir = path.join(process.cwd(), 'data', 'attachments')
  await fs.mkdir(attachDir, { recursive: true })
  const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const savedFileName = `${crypto.randomUUID()}_${safeName}`
  const filePath = path.join(attachDir, savedFileName)
  
  if (fileName.toLowerCase().endsWith('.pdf')) {
    const base64Data = content.replace(/^data:application\/pdf;base64,/, '');
    await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
  } else {
    await fs.writeFile(filePath, content, 'utf-8')
  }

  const summary = {
    bank,
    total: transactions.length,
    withSuggestion,
    withoutSuggestion,
    skipped,
    duplicates,
    minDate: minDate === '9999-12-31' ? null : minDate,
    maxDate: maxDate === '0000-01-01' ? null : maxDate,
    savedFileName,
    originalFileName: fileName,
    // Zapisujemy wybrany zakres dni (i slot, jeśli to import z sekcji "2 wyciągi PDF"),
    // żeby przy kolejnym imporcie móc podpowiedzieć, jaki zakres był użyty poprzednio.
    dayFrom: dayFrom ?? null,
    dayTo: dayTo ?? null,
    pdfSlot: pdfSlot ?? null,
  }
  await logAudit({
    actionName: 'importBankStatement',
    tableName: 'transaction_staging',
    operation: 'IMPORT',
    afterData: summary,
  })

  // Uruchom sprawdzanie zaległości, jeśli to już po 10. dniu miesiąca
  const { processLateReminders } = await import('@/lib/late-reminders')
  const lateReminders = await processLateReminders()

  revalidatePath('/import')
  return { ...summary, lateReminders }
}

export async function getLastImportInfo() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('after_data, created_at')
    .eq('action_name', 'importBankStatement')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    
  if (error || !data) return null
  return {
    ...data.after_data as {
      minDate?: string | null
      maxDate?: string | null
      savedFileName?: string
      originalFileName?: string
    },
    created_at: data.created_at
  }
}

// Zwraca zakres dni (od/do) użyty przy ostatnim imporcie PDF dla danego slotu
// (1 lub 2) w sekcji "Wgraj 2 wyciągi PDF". Dzięki temu przy kolejnym imporcie
// (dla bieżącego miesiąca) można podpowiedzieć, jaki zakres wybrano poprzednio
// dla tego samego dokumentu/konta.
export async function getLastPdfSlotRange(pdfSlot: 1 | 2) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('after_data, created_at')
    .eq('action_name', 'importBankStatement')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return null

  type Summary = {
    dayFrom?: number | null
    dayTo?: number | null
    pdfSlot?: number | null
    minDate?: string | null
    maxDate?: string | null
    originalFileName?: string
  }

  const match = data.find((row) => (row.after_data as Summary | null)?.pdfSlot === pdfSlot)
  if (!match) return null

  const summary = match.after_data as Summary
  return {
    dayFrom: summary.dayFrom ?? null,
    dayTo: summary.dayTo ?? null,
    minDate: summary.minDate ?? null,
    maxDate: summary.maxDate ?? null,
    originalFileName: summary.originalFileName,
    created_at: match.created_at,
  }
}

export async function getImportHistoryList() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, after_data, created_at')
    .eq('action_name', 'importBankStatement')
    .order('created_at', { ascending: false })
    
  if (error) throw error
  return data
}

export async function getFileContent(fileName: string) {
  try {
    const filePath = path.join(process.cwd(), 'data', 'attachments', fileName)
    const content = await fs.readFile(filePath, 'utf-8')
    return content
  } catch (error) {
    console.error('Error reading file:', error)
    return null
  }
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

export async function dismissTransaction(txId: number, reason: 'REJECTED_OWN_TRANSFER' | 'REJECTED_OTHER' = 'REJECTED_OTHER') {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: before } = await (supabase as any).from('transaction_staging').select('*').eq('id', txId).single()
  if (!before) return

  await supabase.from('transactions').insert({
    date: before.date,
    title: before.title,
    amount: before.amount,
    bank_account: before.bank_account,
    type: 'BANK',
    tenant_id: null,
    status: reason,
    category: null,
    raw_data: before.raw_data,
  })

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

export async function dismissAllTransactions() {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allStaging } = await (supabase as any).from('transaction_staging').select('*')
  
  if (allStaging && allStaging.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toInsert = allStaging.map((staging: any) => ({
      date: staging.date,
      title: staging.title,
      amount: staging.amount,
      bank_account: staging.bank_account,
      type: 'BANK',
      tenant_id: null,
      status: 'REJECTED_OTHER',
      category: null,
      raw_data: staging.raw_data,
    }))
    await supabase.from('transactions').insert(toInsert)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('transaction_staging').delete().neq('id', 0)
  await logAudit({
    actionName: 'dismissAllTransactions',
    tableName: 'transaction_staging',
    operation: 'DISMISS',
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
