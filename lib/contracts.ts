import type { getContracts } from '@/app/(dashboard)/umowy/actions'

/**
 * Czysta logika biznesowa zakładki "Umowy", wydzielona z page.tsx żeby dało się
 * ją testować jednostkowo bez renderowania Reacta / bez backendu.
 */

export type Contract = Awaited<ReturnType<typeof getContracts>>[number]
export type SortKey = 'id' | 'tenant' | 'property' | 'type' | 'amount' | 'from' | 'to' | 'active' | 'media'
export type SortDir = 'asc' | 'desc'

export function getTenantData(c: Contract) {
  return c.tenants as unknown as {
    first_name: string
    last_name: string
    properties: { name: string } | null
  } | null
}

export function sortContracts(contracts: Contract[], key: SortKey, dir: SortDir): Contract[] {
  return [...contracts].sort((a, b) => {
    const ta = getTenantData(a)
    const tb = getTenantData(b)
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'id') {
      va = a.id
      vb = b.id
    } else if (key === 'tenant') {
      va = `${ta?.last_name ?? ''} ${ta?.first_name ?? ''}`.toLowerCase()
      vb = `${tb?.last_name ?? ''} ${tb?.first_name ?? ''}`.toLowerCase()
    } else if (key === 'property') {
      va = (ta?.properties?.name ?? '').toLowerCase()
      vb = (tb?.properties?.name ?? '').toLowerCase()
    } else if (key === 'type') {
      va = a.contract_type.toLowerCase()
      vb = b.contract_type.toLowerCase()
    } else if (key === 'amount') {
      va = Number(a.rent_amount)
      vb = Number(b.rent_amount)
    } else if (key === 'from') {
      va = a.start_date
      vb = b.start_date
    } else if (key === 'to') {
      va = a.end_date ?? ''
      vb = b.end_date ?? ''
    } else if (key === 'active') {
      va = a.is_active ? 1 : 0
      vb = b.is_active ? 1 : 0
    } else if (key === 'media') {
      va = ((a as Record<string, unknown>).has_media_invoice ? 1 : 0)
      vb = ((b as Record<string, unknown>).has_media_invoice ? 1 : 0)
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

export function matchesContractFilter(c: Contract, text: string): boolean {
  const q = text.toLowerCase()
  const t = getTenantData(c)
  const tenant = `${t?.first_name ?? ''} ${t?.last_name ?? ''}`.toLowerCase()
  const property = (t?.properties?.name ?? '').toLowerCase()
  const type = c.contract_type.toLowerCase()
  const active = c.is_active ? 'tak' : 'nie'
  return tenant.includes(q) || property.includes(q) || type.includes(q) || active.includes(q)
}

/**
 * Przelicza nowy czynsz po rewaluacji o zadany procent inflacji.
 * Zaokrągla do pełnych jednostek (grosze nie są tu wspierane) - tak samo
 * jak dotychczasowe zachowanie w actions.ts.
 */
export function computeRevaluedAmount(currentAmount: number, inflationPercent: number): number {
  return Math.round(currentAmount * (1 + inflationPercent / 100))
}

/**
 * Parsuje wpisany przez użytkownika procent inflacji (obsługuje przecinek
 * dziesiętny). Zwraca null, gdy wartość jest nieprawidłowa albo <= 0.
 */
export function parseInflationPercent(input: string): number | null {
  const pct = parseFloat(input.replace(',', '.'))
  if (isNaN(pct) || pct <= 0) return null
  return pct
}
