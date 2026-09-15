'use server'

import { createServiceClient } from '@/lib/supabase/service'

export type ChargeEntry = {
  id: string
  date: string
  type: 'invoice'
  amount: number
  tenantName: string
  tenantType: string
  propertyName: string
  invoiceType?: string
}

export async function getAllCharges(year: number): Promise<ChargeEntry[]> {
  const supabase = createServiceClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, tenants(first_name, last_name, company_name, tenant_type, properties(name))')
    .eq('year', year)

  const entries: ChargeEntry[] = []

  for (const inv of invoices ?? []) {
    const t = inv.tenants as { first_name: string; last_name: string; company_name?: string | null; tenant_type?: string; properties?: { name: string } | null } | null
    const name = t ? (t.company_name ? `${t.first_name} ${t.last_name} (${t.company_name})` : `${t.first_name} ${t.last_name}`) : '—'
    entries.push({
      id: `inv-${inv.id}`,
      date: `${inv.year}-${String(inv.month).padStart(2, '0')}-01`,
      type: 'invoice',
      amount: -Number(inv.amount),
      tenantName: name,
      tenantType: t?.tenant_type ?? '',
      propertyName: t?.properties?.name ?? '',
      invoiceType: inv.type,
    })
  }

  entries.sort((a, b) => b.date.localeCompare(a.date))

  return entries
}
