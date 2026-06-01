'use server'

import { createServiceClient } from '@/lib/supabase/service'

export type FlowEntry = {
  id: string
  date: string
  type: 'invoice' | 'transaction'
  description: string
  amount: number
  tenantName: string
  tenantType: string
  invoiceType?: string
  transactionCategory?: string | null
}

export async function getAllFlows(year: number): Promise<FlowEntry[]> {
  const supabase = createServiceClient()

  const [{ data: invoices }, { data: transactions }] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, tenants(first_name, last_name, company_name, tenant_type)')
      .eq('year', year),
    supabase
      .from('transactions')
      .select('*, tenants(first_name, last_name, company_name, tenant_type)')
      .neq('status', 'DISMISSED')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`),
  ])

  const entries: FlowEntry[] = []

  for (const inv of invoices ?? []) {
    const t = inv.tenants as { first_name: string; last_name: string; company_name?: string | null; tenant_type?: string } | null
    const name = t ? (t.company_name ? `${t.first_name} ${t.last_name} (${t.company_name})` : `${t.first_name} ${t.last_name}`) : '—'
    entries.push({
      id: `inv-${inv.id}`,
      date: `${inv.year}-${String(inv.month).padStart(2, '0')}-01`,
      type: 'invoice',
      description: `Rachunek ${inv.number}`,
      amount: -Number(inv.amount),
      tenantName: name,
      tenantType: t?.tenant_type ?? '',
      invoiceType: inv.type,
    })
  }

  for (const tx of transactions ?? []) {
    const t = tx.tenants as { first_name: string; last_name: string; company_name?: string | null; tenant_type?: string } | null
    const name = t ? (t.company_name ? `${t.first_name} ${t.last_name} (${t.company_name})` : `${t.first_name} ${t.last_name}`) : '—'
    entries.push({
      id: `tx-${tx.id}`,
      date: tx.date,
      type: 'transaction',
      description: tx.title || tx.description || 'Wpłata',
      amount: Number(tx.amount),
      tenantName: name,
      tenantType: t?.tenant_type ?? '',
      transactionCategory: tx.category ?? null,
    })
  }

  entries.sort((a, b) => b.date.localeCompare(a.date))

  return entries
}

export async function getFirstTransactionDate(): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('transactions')
    .select('date')
    .neq('status', 'DISMISSED')
    .order('date', { ascending: true })
    .limit(1)
    .single()
  return data?.date ?? null
}
