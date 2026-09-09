import { describe, test, expect } from 'vitest'
import {
  sortContracts,
  matchesContractFilter,
  computeRevaluedAmount,
  parseInflationPercent,
  type Contract,
} from '@/lib/contracts'

type TenantOverride = { firstName: string; lastName: string; propertyName: string } | null

interface ContractOverrides {
  id: number
  contractType?: string
  rentAmount?: number
  hasMediaInvoice?: boolean
  startDate?: string
  endDate?: string | null
  isActive?: boolean
  tenant?: TenantOverride
}

function makeContract(opts: ContractOverrides): Contract {
  const tenant: TenantOverride =
    opts.tenant === undefined
      ? { firstName: 'Jan', lastName: 'Kowalski', propertyName: 'Mieszkanie 1' }
      : opts.tenant

  return {
    id: opts.id,
    contract_type: opts.contractType ?? 'PRIVATE',
    rent_amount: opts.rentAmount ?? 1000,
    has_media_invoice: opts.hasMediaInvoice ?? false,
    start_date: opts.startDate ?? '2024-01-01',
    end_date: opts.endDate ?? null,
    is_active: opts.isActive ?? true,
    tenant_id: 1,
    tenants: tenant
      ? { first_name: tenant.firstName, last_name: tenant.lastName, properties: { name: tenant.propertyName } }
      : null,
  } as unknown as Contract
}

describe('sortContracts', () => {
  const contracts = [
    makeContract({ id: 2, rentAmount: 3000, startDate: '2024-03-01', isActive: false, tenant: { firstName: 'Ala', lastName: 'Nowak', propertyName: 'B' } }),
    makeContract({ id: 1, rentAmount: 1000, startDate: '2024-01-01', isActive: true, tenant: { firstName: 'Jan', lastName: 'Kowalski', propertyName: 'A' } }),
    makeContract({ id: 3, rentAmount: 2000, startDate: '2024-02-01', isActive: true, tenant: { firstName: 'Zenon', lastName: 'Zulu', propertyName: 'C' } }),
  ]

  test('sortuje po ID rosnąco', () => {
    const result = sortContracts(contracts, 'id', 'asc')
    expect(result.map((c) => c.id)).toEqual([1, 2, 3])
  })

  test('sortuje po ID malejąco', () => {
    const result = sortContracts(contracts, 'id', 'desc')
    expect(result.map((c) => c.id)).toEqual([3, 2, 1])
  })

  test('sortuje po nazwisku najemcy (tenant)', () => {
    const result = sortContracts(contracts, 'tenant', 'asc')
    expect(result.map((c) => c.id)).toEqual([1, 2, 3]) // Kowalski, Nowak, Zulu
  })

  test('sortuje po kwocie czynszu', () => {
    const result = sortContracts(contracts, 'amount', 'asc')
    expect(result.map((c) => c.id)).toEqual([1, 3, 2])
  })

  test('sortuje po dacie od', () => {
    const result = sortContracts(contracts, 'from', 'asc')
    expect(result.map((c) => c.id)).toEqual([1, 3, 2])
  })

  test('sortuje po statusie aktywności (aktywne pierwsze przy desc)', () => {
    const result = sortContracts(contracts, 'active', 'desc')
    expect(result[result.length - 1].id).toBe(2) // jedyna nieaktywna na końcu
  })

  test('umowy bezterminowe (end_date=null) sortują się jako pusty string, nie crashują', () => {
    const withoutEnd = makeContract({ id: 4, endDate: null })
    const withEnd = makeContract({ id: 5, endDate: '2025-01-01' })
    const result = sortContracts([withoutEnd, withEnd], 'to', 'asc')
    expect(result.map((c) => c.id)).toEqual([4, 5])
  })

  test('nie mutuje oryginalnej tablicy', () => {
    const original = [...contracts]
    sortContracts(contracts, 'id', 'desc')
    expect(contracts).toEqual(original)
  })

  test('brak powiązanego najemcy (tenants=null) nie wywala wyjątku', () => {
    const orphan = makeContract({ id: 6, tenant: null })
    const result = sortContracts([orphan, contracts[0]], 'tenant', 'asc')
    expect(result).toHaveLength(2)
  })
})

describe('matchesContractFilter', () => {
  const c = makeContract({
    id: 1,
    contractType: 'BUSINESS',
    isActive: true,
    tenant: { firstName: 'Jan', lastName: 'Kowalski', propertyName: 'Lokal 5' },
  })

  test('dopasowuje po imieniu najemcy, bez uwzględniania wielkości liter', () => {
    expect(matchesContractFilter(c, 'JAN')).toBe(true)
  })

  test('dopasowuje po nazwisku najemcy', () => {
    expect(matchesContractFilter(c, 'kowalski')).toBe(true)
  })

  test('dopasowuje po nazwie nieruchomości', () => {
    expect(matchesContractFilter(c, 'lokal 5')).toBe(true)
  })

  test('dopasowuje po typie umowy', () => {
    expect(matchesContractFilter(c, 'business')).toBe(true)
  })

  test('dopasowuje po statusie "tak" dla aktywnej umowy', () => {
    expect(matchesContractFilter(c, 'tak')).toBe(true)
  })

  test('nie dopasowuje statusu "nie" dla aktywnej umowy', () => {
    expect(matchesContractFilter(c, 'nie')).toBe(false)
  })

  test('zwraca false dla niepasującego tekstu', () => {
    expect(matchesContractFilter(c, 'zzzzz')).toBe(false)
  })

  test('pusty filtr dopasowuje każdą umowę', () => {
    expect(matchesContractFilter(c, '')).toBe(true)
  })

  test('brak powiązanego najemcy nie wywala wyjątku i nie dopasowuje po imieniu', () => {
    const orphan = makeContract({ id: 2, tenant: null })
    expect(matchesContractFilter(orphan, 'jan')).toBe(false)
  })
})

describe('computeRevaluedAmount', () => {
  test('podnosi czynsz o podany procent i zaokrągla do pełnych jednostek', () => {
    expect(computeRevaluedAmount(1000, 10)).toBe(1100)
  })

  test('zaokrągla w górę od .5', () => {
    expect(computeRevaluedAmount(1001, 5)).toBe(1051) // 1001 * 1.05 = 1051.05 -> 1051
  })

  test('procent 0 zwraca tę samą kwotę', () => {
    expect(computeRevaluedAmount(2500, 0)).toBe(2500)
  })

  test('obsługuje duże kwoty bez utraty precyzji w rozsądnym zakresie', () => {
    expect(computeRevaluedAmount(1_000_000, 3.6)).toBe(1_036_000)
  })

  test('ujemny procent obniża kwotę (funkcja sama nie waliduje znaku)', () => {
    expect(computeRevaluedAmount(1000, -10)).toBe(900)
  })
})

describe('parseInflationPercent', () => {
  test('parsuje wartość z kropką', () => {
    expect(parseInflationPercent('3.6')).toBe(3.6)
  })

  test('parsuje wartość z przecinkiem dziesiętnym', () => {
    expect(parseInflationPercent('3,6')).toBe(3.6)
  })

  test('odrzuca wartość 0', () => {
    expect(parseInflationPercent('0')).toBeNull()
  })

  test('odrzuca wartość ujemną', () => {
    expect(parseInflationPercent('-5')).toBeNull()
  })

  test('odrzuca tekst niebędący liczbą', () => {
    expect(parseInflationPercent('abc')).toBeNull()
  })

  test('odrzuca pusty string', () => {
    expect(parseInflationPercent('')).toBeNull()
  })

  test('akceptuje bardzo małą wartość dodatnią', () => {
    expect(parseInflationPercent('0.1')).toBe(0.1)
  })
})
