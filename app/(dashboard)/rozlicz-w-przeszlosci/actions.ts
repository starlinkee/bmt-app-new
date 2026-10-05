'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { getCurrentDate } from '@/lib/clock'
import { tenantDisplayName } from '@/lib/utils'
import {
  MAX_BACKFILL_MONTHS,
  contractCoversMonth,
  monthsInRange,
  type YearMonth,
} from '@/lib/rents-backfill'

// Wsteczne dopisywanie czynszów (RENT) za wybrany zakres miesięcy.
// Zgodnie z zasadami billingu (AGENTS.md) tworzymy WYŁĄCZNIE wiersze w
// `invoices` (number: null) - bez PDF-ów i bez maili.

export async function isBackfillEnabled(): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_config')
    .select('backfill_rents_enabled')
    .eq('id', 1)
    .single()
  return data?.backfill_rents_enabled === true
}

async function assertEnabled() {
  if (!(await isBackfillEnabled())) {
    throw new Error('Zakładka "Rozlicz w przeszłości" jest wyłączona w Ustawieniach.')
  }
}

export async function getBackfillTenants() {
  await assertEnabled()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('id, first_name, last_name, tenant_type, company_name, properties(name), contracts(id)')
    .order('last_name')
  if (error) throw error
  return (data ?? [])
    .filter((t) => (t.contracts as unknown[] | null)?.length)
    .map((t) => ({
      id: t.id,
      name: tenantDisplayName(t),
      propertyName: (t.properties as { name?: string } | null)?.name ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
}

export type BackfillRow = {
  tenantId: number
  tenantName: string
  contractId: number
  month: number
  year: number
  amount: number
  exists: boolean
}

async function computeBackfill(tenantIds: number[], from: YearMonth, to: YearMonth) {
  if (!tenantIds.length) throw new Error('Wybierz co najmniej jednego najemcę.')

  const months = monthsInRange(from, to)
  if (!months.length) throw new Error('Miesiąc początkowy jest po miesiącu końcowym.')
  if (months.length > MAX_BACKFILL_MONTHS) {
    throw new Error(`Zakres jest za duży (maks. ${MAX_BACKFILL_MONTHS} miesięcy).`)
  }

  const now = await getCurrentDate()
  const currentIndex = now.getFullYear() * 12 + now.getMonth()
  if (to.year * 12 + (to.month - 1) > currentIndex) {
    throw new Error('Nie można rozliczać miesięcy z przyszłości.')
  }

  const supabase = createServiceClient()
  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, tenant_id, rent_amount, start_date, end_date, is_active, tenants(id, first_name, last_name, tenant_type, company_name)')
    .in('tenant_id', tenantIds)
  if (error) throw error

  const contractIds = (contracts ?? []).map((c) => c.id)
  const existing = new Set<string>()
  if (contractIds.length) {
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('contract_id, month, year')
      .eq('type', 'RENT')
      .in('contract_id', contractIds)
      .gte('year', from.year)
      .lte('year', to.year)
    if (invError) throw invError
    for (const inv of invoices ?? []) existing.add(`${inv.contract_id}-${inv.month}-${inv.year}`)
  }

  const rows: BackfillRow[] = []
  for (const contract of contracts ?? []) {
    const tenant = contract.tenants as {
      first_name: string
      last_name: string
      tenant_type?: string | null
      company_name?: string | null
    } | null
    if (!tenant) continue
    for (const ym of months) {
      if (!contractCoversMonth(contract, ym)) continue
      rows.push({
        tenantId: contract.tenant_id,
        tenantName: tenantDisplayName(tenant),
        contractId: contract.id,
        month: ym.month,
        year: ym.year,
        amount: Number(contract.rent_amount),
        exists: existing.has(`${contract.id}-${ym.month}-${ym.year}`),
      })
    }
  }

  rows.sort((a, b) =>
    a.tenantName.localeCompare(b.tenantName, 'pl') || a.year - b.year || a.month - b.month || a.contractId - b.contractId,
  )

  const coveredTenants = new Set(rows.map((r) => r.tenantId))
  const tenantsWithoutContract = tenantIds.filter((id) => !coveredTenants.has(id))

  return { rows, tenantsWithoutContract }
}

export async function previewBackfillRents(tenantIds: number[], from: YearMonth, to: YearMonth) {
  await assertEnabled()
  return computeBackfill(tenantIds, from, to)
}

export async function executeBackfillRents(tenantIds: number[], from: YearMonth, to: YearMonth) {
  await assertEnabled()
  // Przeliczamy na serwerze od nowa - nie ufamy podglądowi z klienta.
  const { rows } = await computeBackfill(tenantIds, from, to)
  const toCreate = rows.filter((r) => !r.exists)
  const skippedCount = rows.length - toCreate.length

  if (toCreate.length) {
    const supabase = createServiceClient()
    const { error } = await supabase.from('invoices').insert(
      toCreate.map((r) => ({
        type: 'RENT',
        number: null,
        amount: r.amount,
        month: r.month,
        year: r.year,
        tenant_id: r.tenantId,
        contract_id: r.contractId,
        source: 'BACKFILL',
      })),
    )
    if (error) {
      await logAudit({
        actionName: 'backfillRents',
        tableName: 'invoices',
        operation: 'CREATE',
        afterData: { tenantIds, from, to },
        errorData: error,
      })
      throw new Error('Błąd zapisu czynszów: ' + error.message)
    }
  }

  await logAudit({
    actionName: 'backfillRents',
    tableName: 'invoices',
    operation: 'CREATE',
    afterData: { tenantIds, from, to, created: toCreate, skippedCount },
  })
  revalidatePath('/kontrola-platnosci')
  revalidatePath('/historia-obciazen')

  return { createdCount: toCreate.length, skippedCount }
}
