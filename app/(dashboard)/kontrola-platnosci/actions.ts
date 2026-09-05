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
export async function sendBulkStatements() {
  const supabase = createServiceClient()
  const { data: config } = await supabase.from('app_config').select('*').eq('id', 1).single()
  if (!config) throw new Error('Brak konfiguracji aplikacji')

  const tenants = await getTenantsWithBalances()
  const debtors = tenants.filter((t) => t.balance < 0)
  
  if (debtors.length === 0) return { success: true, count: 0 }

  const { getStatement } = await import('@/lib/statement')
  const { generateStatementPdfBuffer } = await import('@/lib/pdf')
  const { sendStatementEmail } = await import('@/lib/email')

  let sentCount = 0
  for (const tenant of debtors) {
    const { data: tDb } = await supabase.from('tenants').select('email, email2, sender_account').eq('id', tenant.id).single()
    if (!tDb || !tDb.email) continue

    const statement = await getStatement(tenant.id)
    const reversedStatement = statement.slice().reverse()
    
    const tenantName = `${tenant.first_name} ${tenant.last_name}`
    const pdfBuffer = await generateStatementPdfBuffer(tenantName, reversedStatement, tenant.balance)
    
    const recipients = [tDb.email, tDb.email2].filter(Boolean) as string[]
    const senderAccount = (tDb.sender_account ?? 1) === 2 ? 2 : 1
    
    await sendStatementEmail(recipients, tenantName, tenant.balance, pdfBuffer, senderAccount, config.late_reminder_subject, config.late_reminder_body)
    sentCount++
  }

  return { success: true, count: sentCount }
}

export async function getGlobalPaymentStats() {
  const supabase = createServiceClient()
  const [{ data: txs }, { data: invs }] = await Promise.all([
    supabase.from('transactions').select('date').neq('status', 'DISMISSED'),
    supabase.from('invoices').select('amount')
  ])

  let earliestDate: Date | null = null
  let totalEarnings = 0

  for (const inv of invs ?? []) {
    totalEarnings += Number(inv.amount)
  }
  
  for (const tx of txs ?? []) {
    if (!tx.date) continue
    const d = new Date(tx.date)
    if (!earliestDate || d < earliestDate) earliestDate = d
  }

  return {
    totalEarnings,
    trackingSince: earliestDate ? earliestDate.toISOString() : null,
  }
}

export async function sendStatementToTenant(tenantId: number) {
  const supabase = createServiceClient()
  const { data: config } = await supabase.from('app_config').select('*').eq('id', 1).single()
  if (!config) throw new Error('Brak konfiguracji aplikacji')

  const tenant = await getTenantWithBalance(tenantId)
  if (!tenant) throw new Error('Nie znaleziono najemcy')

  const { data: tDb } = await supabase.from('tenants').select('email, email2, sender_account').eq('id', tenant.id).single()
  if (!tDb || !tDb.email) throw new Error('Najemca nie ma przypisanego adresu email')

  const { getStatement } = await import('@/lib/statement')
  const { generateStatementPdfBuffer } = await import('@/lib/pdf')
  const { sendStatementEmail } = await import('@/lib/email')

  const statement = await getStatement(tenant.id)
  const reversedStatement = statement.slice().reverse()
  
  const tenantName = `${tenant.first_name} ${tenant.last_name}`
  const pdfBuffer = await generateStatementPdfBuffer(tenantName, reversedStatement, tenant.balance)
  
  const recipients = [tDb.email, tDb.email2].filter(Boolean) as string[]
  const senderAccount = (tDb.sender_account ?? 1) === 2 ? 2 : 1
  await sendStatementEmail(recipients, tenantName, tenant.balance, pdfBuffer, senderAccount, config.late_reminder_subject, config.late_reminder_body)

  return { success: true }
}
