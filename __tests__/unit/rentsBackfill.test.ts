import { describe, it, expect } from 'vitest'
import { monthsInRange, contractCoversMonth, pickContractForMonth, parseAmountInput } from '@/lib/rents-backfill'

describe('monthsInRange', () => {
  it('obejmuje miesiąc końcowy (05-10 -> 6 miesięcy)', () => {
    const r = monthsInRange({ month: 5, year: 2025 }, { month: 10, year: 2025 })
    expect(r).toHaveLength(6)
    expect(r[0]).toEqual({ month: 5, year: 2025 })
    expect(r[5]).toEqual({ month: 10, year: 2025 })
  })

  it('przechodzi przez przełom roku', () => {
    expect(monthsInRange({ month: 11, year: 2024 }, { month: 2, year: 2025 })).toEqual([
      { month: 11, year: 2024 },
      { month: 12, year: 2024 },
      { month: 1, year: 2025 },
      { month: 2, year: 2025 },
    ])
  })

  it('jeden miesiąc gdy od == do', () => {
    expect(monthsInRange({ month: 3, year: 2025 }, { month: 3, year: 2025 })).toEqual([{ month: 3, year: 2025 }])
  })

  it('pusta tablica gdy od > do', () => {
    expect(monthsInRange({ month: 4, year: 2025 }, { month: 3, year: 2025 })).toEqual([])
  })
})

describe('contractCoversMonth', () => {
  const base = { start_date: '2025-03-15', end_date: '2025-08-31', is_active: true }

  it('pomija miesiące przed startem umowy', () => {
    expect(contractCoversMonth(base, { month: 2, year: 2025 })).toBe(false)
  })

  it('obejmuje miesiąc startu i miesiąc zakończenia', () => {
    expect(contractCoversMonth(base, { month: 3, year: 2025 })).toBe(true)
    expect(contractCoversMonth(base, { month: 8, year: 2025 })).toBe(true)
  })

  it('pomija miesiące po zakończeniu', () => {
    expect(contractCoversMonth(base, { month: 9, year: 2025 })).toBe(false)
  })

  it('nieaktywna umowa z end_date obejmuje okres historyczny', () => {
    expect(contractCoversMonth({ ...base, is_active: false }, { month: 5, year: 2025 })).toBe(true)
  })

  it('nieaktywna umowa bez end_date jest pomijana', () => {
    expect(contractCoversMonth({ ...base, end_date: null, is_active: false }, { month: 5, year: 2025 })).toBe(false)
  })

  it('aktywna umowa bezterminowa obejmuje każdy miesiąc od startu', () => {
    expect(contractCoversMonth({ ...base, end_date: null }, { month: 1, year: 2030 })).toBe(true)
  })
})

describe('pickContractForMonth', () => {
  const old = { id: 1, start_date: '2024-01-01', end_date: '2024-12-31', is_active: false, has_media_invoice: true }
  const noMedia = { id: 2, start_date: '2025-01-01', end_date: null, is_active: true, has_media_invoice: false }
  const media = { id: 3, start_date: '2025-01-01', end_date: null, is_active: true, has_media_invoice: true }

  it('wybiera umowę obowiązującą w danym miesiącu', () => {
    expect(pickContractForMonth([old, noMedia], { month: 6, year: 2024 })?.id).toBe(1)
    expect(pickContractForMonth([old, noMedia], { month: 6, year: 2025 })?.id).toBe(2)
  })

  it('preferuje umowę z mediami', () => {
    expect(pickContractForMonth([noMedia, media], { month: 6, year: 2025 })?.id).toBe(3)
  })

  it('null gdy żadna umowa nie obowiązuje', () => {
    expect(pickContractForMonth([old], { month: 6, year: 2023 })).toBeNull()
  })
})

describe('parseAmountInput', () => {
  it('puste pole -> null', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('  ')).toBeNull()
  })

  it('akceptuje przecinek, kropkę i spacje', () => {
    expect(parseAmountInput('123,45')).toBe(123.45)
    expect(parseAmountInput('1 200.5')).toBe(1200.5)
  })

  it('NaN dla nieprawidłowych, zerowych i ujemnych kwot', () => {
    expect(parseAmountInput('abc')).toBeNaN()
    expect(parseAmountInput('0')).toBeNaN()
    expect(parseAmountInput('-5')).toBeNaN()
    expect(parseAmountInput('1,234')).toBeNaN()
  })
})
