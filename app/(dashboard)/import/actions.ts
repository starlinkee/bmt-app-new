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

// Slot dokumentu, dla którego robiony jest import — pozwala rozróżnić, do
// którego "dokumentu" należy dany zakres dni (dayFrom/dayTo), żeby przy
// kolejnym imporcie tego samego dokumentu podpowiedzieć poprzednio użyty
// zakres. 0 = pojedynczy plik CSV (sekcja główna), 1/2 = wyciągi PDF
// (sekcja "2 wyciągi PDF").
export type ImportDocSlot = 0 | 1 | 2

export async function importBankStatement(
  content: string,
  fileName: string = 'unknown.csv',
  dayFrom?: number,
  dayTo?: number,
  docSlot?: ImportDocSlot,
) {
  const supabase = createServiceClient()

  // Rezerwujemy wiersz audit_log jako "batch" tego importu, zanim jeszcze
  // wiemy, ile transakcji zostanie wczytanych — dzięki temu każdy rekord
  // w transaction_staging/transactions może być od razu oznaczony
  // import_id, co pozwala historii importów pokazywać żywy status
  // (do zatwierdzenia / zatwierdzono / odrzucono), a nie zrzut z chwili
  // wgrania pliku. after_data uzupełniamy pełnym podsumowaniem na końcu.
  const { data: importRow, error: importRowError } = await supabase
    .from('audit_log')
    .insert({
      action_name: 'importBankStatement',
      table_name: 'transaction_staging',
      operation: 'IMPORT',
    })
    .select('id')
    .single()
  if (importRowError || !importRow) {
    throw importRowError ?? new Error('Nie udało się utworzyć wpisu importu')
  }
  const importId = importRow.id

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
        import_id: importId,
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('transactions') as any).insert(toInsertSkipped)
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
      .eq('status', 'MATCHED')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: stagingCount } = await (supabase as any)
      .from('transaction_staging')
      .select('*', { count: 'exact', head: true })
      .eq('date', tx.date)
      .eq('amount', tx.amount)
      .eq('bank_account', tx.bankAccount ?? '')

    // Transakcja już czeka nieprzetworzona w kolejce (np. z poprzedniego,
    // niedokończonego importu tego samego pliku) — oryginał i tak tam jest
    // i wciąż czeka na decyzję, więc nie tworzymy drugiej kopii do
    // zaakceptowania/odrzucenia. To nie jest "duplikat" w sensie transakcji
    // już zaksięgowanej, tylko wpis już będący w kolejce.
    if ((stagingCount ?? 0) > 0) {
      skipped++
      continue
    }

    const isDuplicate = (count ?? 0) > 0
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

    const rawDataWithFlag: Record<string, unknown> = tx.rawData ? { ...tx.rawData } : {}
    if (autoReject) {
      rawDataWithFlag._auto_reject = true
      if (isDuplicate) {
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
      import_id: importId,
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
    // Zapisujemy wybrany zakres dni oraz slot dokumentu, żeby przy kolejnym
    // imporcie tego samego dokumentu móc podpowiedzieć, jaki zakres był
    // użyty poprzednio.
    dayFrom: dayFrom ?? null,
    dayTo: dayTo ?? null,
    docSlot: docSlot ?? null,
  }
  await supabase.from('audit_log').update({ after_data: summary }).eq('id', importId)

  // Automatyczne ponaglenia do zalegających najemców po imporcie są obecnie
  // wyłączone (na życzenie) — logika w lib/late-reminders.ts zostaje w kodzie
  // (używa jej nadal panel Testowanie), ale nie jest tu wywoływana.

  revalidatePath('/import')
  return { ...summary, lateReminders: null }
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
      docSlot?: number | null
    },
    created_at: data.created_at
  }
}

// Zwraca zakres dni (od/do) użyty przy ostatnim imporcie danego dokumentu
// (slot 0 = plik CSV z sekcji głównej, 1/2 = wyciągi PDF z sekcji "2 wyciągi
// PDF"). Dzięki temu przy kolejnym imporcie (np. za bieżący miesiąc) można
// podpowiedzieć, jaki zakres wybrano poprzednio dla tego samego dokumentu/konta.
export async function getLastImportSlotRange(docSlot: ImportDocSlot) {
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
    docSlot?: number | null
    pdfSlot?: number | null // pole legacy, sprzed wprowadzenia slotu 0 dla CSV
    minDate?: string | null
    maxDate?: string | null
    originalFileName?: string
  }

  const match = data.find((row) => {
    const s = row.after_data as Summary | null
    return (s?.docSlot ?? s?.pdfSlot) === docSlot
  })
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

export type ImportKind = 'csv' | 'pdf'

export type ImportKindStatus = {
  lastImportAt: string | null
  lastApprovedAt: string | null
}

// Dla każdego rodzaju importu (CSV / 2 wyciągi PDF) zwraca: kiedy wykonano
// ostatni import oraz kiedy zatwierdzono ostatni import. "Zatwierdzony import"
// to import, w którym nic już nie czeka na decyzję (brak rekordów w
// transaction_staging) i przynajmniej jedna transakcja została zatwierdzona
// (MATCHED); data zatwierdzenia = moment zapisania ostatniej takiej transakcji.
// Wszystko liczone na żywo z import_id, więc nic nie trzeba osobno utrzymywać.
export async function getImportKindStatuses(): Promise<Record<ImportKind, ImportKindStatus>> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, after_data, created_at')
    .eq('action_name', 'importBankStatement')
    .order('created_at', { ascending: false })

  const result: Record<ImportKind, ImportKindStatus> = {
    csv: { lastImportAt: null, lastApprovedAt: null },
    pdf: { lastImportAt: null, lastApprovedAt: null },
  }
  if (error || !data || data.length === 0) return result

  const kindOf = (afterData: unknown): ImportKind => {
    const s = (afterData ?? {}) as { docSlot?: number | null; pdfSlot?: number | null; originalFileName?: string }
    const slot = s.docSlot ?? s.pdfSlot
    if (slot === 1 || slot === 2) return 'pdf'
    if (slot == null && s.originalFileName?.toLowerCase().endsWith('.pdf')) return 'pdf'
    return 'csv'
  }

  const importIds = data.map((row) => row.id)
  const [{ data: pendingRows }, { data: matchedRows }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('transaction_staging').select('import_id').in('import_id', importIds) as Promise<{ data: { import_id: number }[] | null }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('transactions').select('import_id, created_at').eq('status', 'MATCHED').in('import_id', importIds) as Promise<{ data: { import_id: number; created_at: string }[] | null }>,
  ])

  const pending = new Set((pendingRows ?? []).map((r) => r.import_id))
  const lastMatchedAt = new Map<number, string>()
  for (const row of matchedRows ?? []) {
    const prev = lastMatchedAt.get(row.import_id)
    if (!prev || row.created_at > prev) lastMatchedAt.set(row.import_id, row.created_at)
  }

  // data jest posortowana malejąco po created_at
  for (const row of data) {
    const status = result[kindOf(row.after_data)]
    if (!status.lastImportAt) status.lastImportAt = row.created_at
    const approvedAt = lastMatchedAt.get(row.id)
    if (approvedAt && !pending.has(row.id) && (!status.lastApprovedAt || approvedAt > status.lastApprovedAt)) {
      status.lastApprovedAt = approvedAt
    }
  }
  return result
}

export async function getImportHistoryList() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, after_data, created_at')
    .eq('action_name', 'importBankStatement')
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!data || data.length === 0) return []

  // Liczymy żywy status każdego importu (ile transakcji wciąż czeka, ile
  // zatwierdzono, ile odrzucono) na podstawie import_id na powiązanych
  // rekordach — zamiast polegać na zrzucie liczb zapisanym w after_data
  // w chwili wgrania pliku, który nigdy się nie aktualizuje.
  const importIds = data.map((row) => row.id)

  const [{ data: pendingRows }, { data: resolvedRows }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('transaction_staging').select('import_id').in('import_id', importIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('transactions').select('import_id, status').in('import_id', importIds) as Promise<{ data: { import_id: number | null; status: string | null }[] | null }>,
  ])

  const pendingByImport = new Map<number, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (pendingRows ?? []) as any[]) {
    pendingByImport.set(row.import_id, (pendingByImport.get(row.import_id) ?? 0) + 1)
  }

  const acceptedByImport = new Map<number, number>()
  const rejectedByImport = new Map<number, number>()
  for (const row of resolvedRows ?? []) {
    if (row.import_id == null) continue
    if (row.status === 'MATCHED') {
      acceptedByImport.set(row.import_id, (acceptedByImport.get(row.import_id) ?? 0) + 1)
    } else if (row.status?.startsWith('REJECTED')) {
      rejectedByImport.set(row.import_id, (rejectedByImport.get(row.import_id) ?? 0) + 1)
    }
  }

  return data.map((row) => ({
    ...row,
    pendingCount: pendingByImport.get(row.id) ?? 0,
    acceptedCount: acceptedByImport.get(row.id) ?? 0,
    rejectedCount: rejectedByImport.get(row.id) ?? 0,
  }))
}

export type ImportTransaction = {
  id: number
  source: 'transaction' | 'staging'
  date: string
  title: string | null
  bank_account: string | null
  amount: number
  category: string | null
  status: string
  description: string | null
  tenant: { first_name: string; last_name: string } | null
}

export async function getImportTransactions(importId: number): Promise<ImportTransaction[]> {
  const supabase = createServiceClient()

  const [{ data: transactions, error: txError }, { data: staged, error: stagedError }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('transactions')
      .select('id, date, title, bank_account, amount, category, status, description, tenants(first_name, last_name)')
      .eq('import_id', importId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('transaction_staging')
      .select('id, date, title, bank_account, amount, category, suggested_tenant_id, tenants:suggested_tenant_id(first_name, last_name)')
      .eq('import_id', importId),
  ])

  if (txError) throw txError
  if (stagedError) throw stagedError

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromTransactions: ImportTransaction[] = ((transactions ?? []) as any[]).map((t) => ({
    id: t.id,
    source: 'transaction',
    date: t.date,
    title: t.title,
    bank_account: t.bank_account,
    amount: Number(t.amount),
    category: t.category,
    status: t.status ?? 'UNMATCHED',
    description: t.description ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenant: (t.tenants as any) ?? null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromStaging: ImportTransaction[] = ((staged ?? []) as any[]).map((s) => ({
    id: s.id,
    source: 'staging',
    date: s.date,
    title: s.title,
    bank_account: s.bank_account,
    amount: Number(s.amount),
    category: s.category,
    status: 'PENDING',
    description: null,
    tenant: s.tenants ?? null,
  }))

  return [...fromTransactions, ...fromStaging].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
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
    import_id: staged.import_id ?? null,
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

export async function dismissTransaction(
  txId: number,
  reason: 'REJECTED_OWN_TRANSFER' | 'REJECTED_OTHER' | 'REJECTED_DUPLICATE' = 'REJECTED_OTHER',
  note?: string,
) {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: before } = await (supabase as any).from('transaction_staging').select('*').eq('id', txId).single()
  if (!before) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('transactions') as any).insert({
    date: before.date,
    title: before.title,
    amount: before.amount,
    bank_account: before.bank_account,
    type: 'BANK',
    tenant_id: null,
    status: reason,
    category: null,
    raw_data: before.raw_data,
    description: note?.trim() || null,
    import_id: before.import_id ?? null,
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
      import_id: staging.import_id ?? null,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('transactions') as any).insert(toInsert)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('transaction_staging').delete().neq('id', 0)
  await logAudit({
    actionName: 'dismissAllTransactions',
    tableName: 'transaction_staging',
    operation: 'DISMISS',
    beforeData: allStaging,
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
