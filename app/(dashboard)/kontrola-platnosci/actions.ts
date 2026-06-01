'use server'

import { createServiceClient } from '@/lib/supabase/service'

export async function getTenantsWithBalances() {
  const supabase = createServiceClient()

  const [{ data: tenants }, { data: transactions }, { data: invoices }] =
    await Promise.all([
      supabase
        .from('tenants')
        .select('id, first_name, last_name, company_name, properties(name, address1)'),
      supabase
        .from('transactions')
        .select('tenant_id, amount')
        .neq('status', 'DISMISSED'),
      supabase.from('invoices').select('tenant_id, amount'),
    ])

  const txMap = new Map<number, number>()
  for (const tx of transactions ?? []) {
    if (tx.tenant_id == null) continue
    txMap.set(tx.tenant_id, (txMap.get(tx.tenant_id) ?? 0) + Number(tx.amount))
  }

  const invMap = new Map<number, number>()
  for (const inv of invoices ?? []) {
    if (inv.tenant_id == null) continue
    invMap.set(inv.tenant_id, (invMap.get(inv.tenant_id) ?? 0) + Number(inv.amount))
  }

  return (tenants ?? [])
    .map((t) => ({
      id: t.id,
      first_name: t.first_name,
      last_name: t.last_name,
      company_name: t.company_name,
      property: t.properties as unknown as { name: string; address1: string } | null,
      balance: (txMap.get(t.id) ?? 0) - (invMap.get(t.id) ?? 0),
    }))
    .sort((a, b) => a.balance - b.balance)
}

export async function getTenantStatement(tenantId: number) {
  const { getStatement } = await import('@/lib/statement')
  return getStatement(tenantId)
}

export async function getTenantWithBalance(tenantId: number) {
  const supabase = createServiceClient()

  const [{ data: tenant }, { data: transactions }, { data: invoices }] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, first_name, last_name, company_name, properties(name, address1)')
      .eq('id', tenantId)
      .single(),
    supabase.from('transactions').select('amount').eq('tenant_id', tenantId).neq('status', 'DISMISSED'),
    supabase.from('invoices').select('amount').eq('tenant_id', tenantId),
  ])

  if (!tenant) return null

  const txSum = (transactions ?? []).reduce((sum, tx) => sum + Number(tx.amount), 0)
  const invSum = (invoices ?? []).reduce((sum, inv) => sum + Number(inv.amount), 0)

  return {
    id: tenant.id,
    first_name: tenant.first_name,
    last_name: tenant.last_name,
    company_name: tenant.company_name,
    property: tenant.properties as unknown as { name: string; address1: string } | null,
    balance: txSum - invSum,
  }
}
