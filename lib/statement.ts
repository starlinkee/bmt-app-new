import { createServiceClient } from '@/lib/supabase/service'
import type { StatementEntry } from '@/types/app'

/**
 * Łączy rachunki i transakcje w chronologiczny wyciąg z bieżącym saldem.
 * Model "Skarbonka" — payments pokrywają najstarsze rachunki first.
 */
export async function getStatement(tenantId: number): Promise<StatementEntry[]> {
  const supabase = createServiceClient()

  const [{ data: invoices }, { data: transactions }] = await Promise.all([
    supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('year', { ascending: true })
      .order('month', { ascending: true }),
    supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('status', 'DISMISSED')
      .order('date', { ascending: true }),
  ])

  const txIds = (transactions ?? []).map((t) => t.id)
  let amendedTxIds = new Set<number>()
  if (txIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: amendments } = await (supabase as any)
      .from('transaction_amendments')
      .select('transaction_id')
      .in('transaction_id', txIds)
    amendedTxIds = new Set<number>(
      (amendments ?? []).map((a: { transaction_id: number }) => a.transaction_id)
    )
  }

  const entries: StatementEntry[] = []

  for (const inv of invoices ?? []) {
    entries.push({
      id: `inv-${inv.id}`,
      date: `${inv.year}-${String(inv.month).padStart(2, '0')}-01`,
      description: `Rachunek ${inv.number} (${inv.type})`,
      amount: -Number(inv.amount),
      runningBalance: 0,
      isPaid: false,
      type: 'invoice',
      invoiceType: inv.type,
    })
  }

  for (const tx of transactions ?? []) {
    entries.push({
      id: `tx-${tx.id}`,
      date: tx.date,
      description: tx.title || tx.description || 'Wpłata',
      amount: Number(tx.amount),
      runningBalance: 0,
      isPaid: true,
      type: 'transaction',
      transactionCategory: tx.category ?? null,
      rawTxId: tx.id,
      txStatus: tx.status,
      hasAmendments: amendedTxIds.has(tx.id),
    })
  }

  entries.sort((a, b) => a.date.localeCompare(b.date))

  // Oblicz bieżące saldo
  let running = 0
  for (const e of entries) {
    running += e.amount
    e.runningBalance = running
  }

  // Model creditPool: oznacz rachunki jako opłacone jeśli credit pool je pokrywa
  let creditPool = 0
  for (const e of entries) {
    if (e.type === 'transaction') {
      creditPool += e.amount
    } else {
      const invoiceAmount = Math.abs(e.amount)
      if (creditPool >= invoiceAmount) {
        creditPool -= invoiceAmount
        e.isPaid = true
      } else {
        e.isPaid = false
      }
    }
  }

  return entries
}
