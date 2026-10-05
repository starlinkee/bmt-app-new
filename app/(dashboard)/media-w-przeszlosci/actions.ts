'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { getCurrentDate } from '@/lib/clock'
import {
  MAX_BACKFILL_MONTHS,
  monthsInRange,
  pickContractForMonth,
  type YearMonth,
} from '@/lib/rents-backfill'
import { isBackfillEnabled } from '../rozlicz-w-przeszlosci/actions'

// Wsteczne dopisywanie historycznych rachunków za media (MEDIA) dla jednego
// najemcy - kwoty wpisywane ręcznie, bez arkuszy Google, PDF-ów i maili
// (to dane historyczne, nie rozliczenie). Widoczność sterowana tym samym
// przełącznikiem co "Rozlicz w przeszłości" (app_config.backfill_rents_enabled).

async function assertEnabled() {
  if (!(await isBackfillEnabled())) {
    throw new Error('Zakładki z danymi historycznymi są wyłączone w Ustawieniach.')
  }
}

async function assertRange(from: YearMonth, to: YearMonth) {
  const months = monthsInRange(from, to)
  if (!months.length) throw new Error('Miesiąc początkowy jest po miesiącu końcowym.')
  if (months.length > MAX_BACKFILL_MONTHS) {
    throw new Error(`Zakres jest za duży (maks. ${MAX_BACKFILL_MONTHS} miesięcy).`)
  }
  const now = await getCurrentDate()
  if (to.year * 12 + (to.month - 1) > now.getFullYear() * 12 + now.getMonth()) {
    throw new Error('Nie można rozliczać miesięcy z przyszłości.')
  }
  return months
}

export type MediaBackfillMonth = {
  month: number
  year: number
  contractId: number | null
  existingAmount: number | null
}

async function computeMonths(tenantId: number, from: YearMonth, to: YearMonth): Promise<MediaBackfillMonth[]> {
  const months = await assertRange(from, to)
  const supabase = createServiceClient()

  const [contractsResult, invoicesResult] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, start_date, end_date, is_active, has_media_invoice')
      .eq('tenant_id', tenantId),
    supabase
      .from('invoices')
      .select('month, year, amount')
      .eq('tenant_id', tenantId)
      .eq('type', 'MEDIA')
      .gte('year', from.year)
      .lte('year', to.year),
  ])
  if (contractsResult.error) throw contractsResult.error
  if (invoicesResult.error) throw invoicesResult.error

  // Suma, gdyby w miesiącu było kilka rachunków (np. różne umowy).
  const existing = new Map<string, number>()
  for (const inv of invoicesResult.data ?? []) {
    const key = `${inv.month}-${inv.year}`
    existing.set(key, (existing.get(key) ?? 0) + Number(inv.amount))
  }

  return months.map((ym) => ({
    ...ym,
    contractId: pickContractForMonth(contractsResult.data ?? [], ym)?.id ?? null,
    existingAmount: existing.get(`${ym.month}-${ym.year}`) ?? null,
  }))
}

export async function getMediaBackfillMonths(tenantId: number, from: YearMonth, to: YearMonth) {
  await assertEnabled()
  return computeMonths(tenantId, from, to)
}

export async function saveMediaBackfill(
  tenantId: number,
  from: YearMonth,
  to: YearMonth,
  amounts: { month: number; year: number; amount: number }[],
) {
  await assertEnabled()
  if (!amounts.length) throw new Error('Nie wpisano żadnej kwoty.')

  // Przeliczamy na serwerze od nowa - nie ufamy stanowi formularza.
  const months = await computeMonths(tenantId, from, to)
  const byKey = new Map(months.map((m) => [`${m.month}-${m.year}`, m]))

  const rows = []
  for (const a of amounts) {
    const m = byKey.get(`${a.month}-${a.year}`)
    if (!m) throw new Error(`Miesiąc ${a.month}/${a.year} jest poza wybranym zakresem.`)
    if (m.existingAmount !== null) throw new Error(`Rachunek za media za ${a.month}/${a.year} już istnieje.`)
    if (m.contractId === null) throw new Error(`Brak umowy obowiązującej w ${a.month}/${a.year}.`)
    if (!(a.amount > 0)) throw new Error(`Nieprawidłowa kwota za ${a.month}/${a.year}.`)
    rows.push({
      type: 'MEDIA',
      number: null,
      amount: Math.round(a.amount * 100) / 100,
      month: a.month,
      year: a.year,
      tenant_id: tenantId,
      contract_id: m.contractId,
      source: 'BACKFILL',
    })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('invoices').insert(rows)
  if (error) {
    await logAudit({
      actionName: 'backfillMedia',
      tableName: 'invoices',
      operation: 'CREATE',
      afterData: { tenantId, rows },
      errorData: error,
    })
    throw new Error('Błąd zapisu rachunków: ' + error.message)
  }

  await logAudit({
    actionName: 'backfillMedia',
    tableName: 'invoices',
    operation: 'CREATE',
    afterData: { tenantId, rows },
  })
  revalidatePath('/kontrola-platnosci')
  revalidatePath('/historia-obciazen')

  return { createdCount: rows.length }
}
