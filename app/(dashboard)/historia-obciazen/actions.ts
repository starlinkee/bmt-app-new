'use server'

import { createServiceClient } from '@/lib/supabase/service'

export type ChargeEntry = {
  id: string
  date: string
  type: 'invoice'
  description: string
  amount: number
  tenantName: string
  tenantType: string
  invoiceType?: string
}

export async function getAllCharges(year: number): Promise<ChargeEntry[]> {
  const supabase = createServiceClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, tenants(first_name, last_name, company_name, tenant_type)')
    .eq('year', year)

  const entries: ChargeEntry[] = []

  for (const inv of invoices ?? []) {
    const t = inv.tenants as { first_name: string; last_name: string; company_name?: string | null; tenant_type?: string } | null
    const name = t ? (t.company_name ? `${t.first_name} ${t.last_name} (${t.company_name})` : `${t.first_name} ${t.last_name}`) : '—'
    entries.push({
      id: `inv-${inv.id}`,
      date: `${inv.year}-${String(inv.month).padStart(2, '0')}-01`,
      type: 'invoice',
      description: `Obciążenie ${inv.number ? '(' + inv.number + ')' : ''}`,
      amount: -Number(inv.amount),
      tenantName: name,
      tenantType: t?.tenant_type ?? '',
      invoiceType: inv.type,
    })
  }

  entries.sort((a, b) => b.date.localeCompare(a.date))

  return entries
}
