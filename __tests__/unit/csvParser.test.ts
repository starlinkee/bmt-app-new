import { describe, test, expect } from 'vitest'
import { parseCsv } from '@/lib/csvParser'

// Helper: buduje CSV z nagłówkami i wierszami
function makeCsv(headers: string[], rows: string[][]): string {
  return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
}

describe('parseCsv - detekcja banku', () => {
  test('rozpoznaje PKO BP', () => {
    const csv = makeCsv(
      ['Data operacji', 'Opis transakcji', 'Kwota', 'Rachunek nadawcy/odbiorcy'],
      [['2024-01-15', 'Przelew czynsz', '1 500,00', '12 3456 7890 1234 5678 9012 3456']],
    )
    const { bank } = parseCsv(csv)
    expect(bank).toBe('PKO BP')
  })

  test('rozpoznaje mBank', () => {
    const csv = makeCsv(
      ['#Data operacji', 'Tytuł', 'Kwota', 'Numer rachunku'],
      [['2024-01-15', 'Czynsz styczeń', '2 000,00', 'PL98765432109876543210987654']],
    )
    const { bank } = parseCsv(csv)
    expect(bank).toBe('mBank')
  })

  test('zwraca "Nierozpoznany bank" dla nieznanego formatu', () => {
    const csv = makeCsv(
      ['Kolumna1', 'Kolumna2', 'Kolumna3'],
      [['a', 'b', 'c']],
    )
    const { bank } = parseCsv(csv)
    expect(bank).toBe('Nierozpoznany bank')
  })
})

describe('parseCsv - parsowanie kwot', () => {
  const pkoCsv = (amount: string) =>
    makeCsv(
      ['Data operacji', 'Opis transakcji', 'Kwota', 'Rachunek nadawcy/odbiorcy'],
      [['2024-01-15', 'Czynsz', amount, '']],
    )

  test('parsuje kwotę z polskim formatem "1 234,56"', () => {
    const { transactions } = parseCsv(pkoCsv('1 234,56'))
    expect(transactions[0].amount).toBe(1234.56)
  })

  test('parsuje kwotę całkowitą "1500,00"', () => {
    const { transactions } = parseCsv(pkoCsv('1500,00'))
    expect(transactions[0].amount).toBe(1500)
  })

  test('pomija transakcje wychodzące (kwota ujemna)', () => {
    const { transactions, skipped } = parseCsv(pkoCsv('-500,00'))
    expect(transactions).toHaveLength(0)
    expect(skipped).toBe(1)
  })

  test('pomija kwotę zero', () => {
    const { transactions, skipped } = parseCsv(pkoCsv('0,00'))
    expect(transactions).toHaveLength(0)
    expect(skipped).toBe(1)
  })
})

describe('parseCsv - normalizacja dat', () => {
  const pkoRow = (date: string) =>
    makeCsv(
      ['Data operacji', 'Opis transakcji', 'Kwota'],
      [[date, 'Czynsz', '1000,00']],
    )

  test('zostawia format YYYY-MM-DD bez zmian', () => {
    const { transactions } = parseCsv(pkoRow('2024-03-15'))
    expect(transactions[0].date).toBe('2024-03-15')
  })

  test('konwertuje DD.MM.YYYY na YYYY-MM-DD', () => {
    const { transactions } = parseCsv(pkoRow('15.03.2024'))
    expect(transactions[0].date).toBe('2024-03-15')
  })

  test('konwertuje DD-MM-YYYY na YYYY-MM-DD', () => {
    const { transactions } = parseCsv(pkoRow('15-03-2024'))
    expect(transactions[0].date).toBe('2024-03-15')
  })

  test('konwertuje DD/MM/YYYY na YYYY-MM-DD', () => {
    const { transactions } = parseCsv(pkoRow('15/03/2024'))
    expect(transactions[0].date).toBe('2024-03-15')
  })
})

describe('parseCsv - rachunek bankowy', () => {
  test('pobiera numer rachunku z PKO BP', () => {
    const csv = makeCsv(
      ['Data operacji', 'Opis transakcji', 'Kwota', 'Rachunek nadawcy/odbiorcy'],
      [['2024-01-15', 'Czynsz', '1000,00', 'PL12 3456 7890 1234 5678 9012 3456']],
    )
    const { transactions } = parseCsv(csv)
    expect(transactions[0].bankAccount).toBe('PL12 3456 7890 1234 5678 9012 3456')
  })

  test('pomija puste konto', () => {
    const csv = makeCsv(
      ['Data operacji', 'Opis transakcji', 'Kwota', 'Rachunek nadawcy/odbiorcy'],
      [['2024-01-15', 'Czynsz', '1000,00', '']],
    )
    const { transactions } = parseCsv(csv)
    expect(transactions[0].bankAccount).toBeUndefined()
  })
})

describe('parseCsv - pusty / błędny CSV', () => {
  test('zwraca 0 transakcji dla pustego pliku', () => {
    const { transactions } = parseCsv('')
    expect(transactions).toHaveLength(0)
  })

  test('pomija wiersz bez daty', () => {
    const csv = makeCsv(
      ['Data operacji', 'Opis transakcji', 'Kwota'],
      [['', 'Czynsz', '1000,00']],
    )
    const { skipped } = parseCsv(csv)
    expect(skipped).toBeGreaterThan(0)
  })
})
