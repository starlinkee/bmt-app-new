import { createServiceClient } from '@/lib/supabase/service'

/**
 * Saldo "Skarbonka": suma wpłat (transactions) minus suma rachunków (invoices).
 * Wartość dodatnia = nadpłata, ujemna = zaległość.
 */
export async function calculateBalance(tenantId: number): Promise<number> {
  const supabase = createServiceClient()

  const [{ data: txData }, { data: invData }] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount')
      .eq('tenant_id', tenantId)
      .neq('status', 'DISMISSED'),
    supabase
      .from('invoices')
      .select('amount')
      .eq('tenant_id', tenantId),
  ])

  const txSum = (txData ?? []).reduce((acc, r) => acc + Number(r.amount), 0)
  const invSum = (invData ?? []).reduce((acc, r) => acc + Number(r.amount), 0)

  return txSum - invSum
}
