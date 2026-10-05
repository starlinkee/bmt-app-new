import { describe, test, expect, vi } from 'vitest'

// Zamiast prawdziwego PDF-a podstawiamy tekst, który pdf-parse wyciągnąłby
// ze strony (wiersz po wierszu) - testujemy logikę parsera wyciągu Millennium,
// nie bibliotekę pdf-parse.
let pdfText = ''
vi.mock('pdf-parse/lib/pdf-parse.js', () => ({ default: async () => ({ text: pdfText }) }))

const { parsePdf } = await import('@/lib/pdfParser')

const parse = (lines: string[]) => {
  pdfText = lines.join('\n')
  return parsePdf(Buffer.from(''))
}

describe('parsePdf (Millennium)', () => {
  test('wpłata przychodząca: data, kwota, tytuł i rachunek nadawcy', async () => {
    const result = await parse([
      '2026-03-05 2026-03-05 PRZELEW PRZYCHODZĄCY 1.234,56 11.234,56',
      'Z R-ku: 12 3456 7890 1234 5678 9012 3456',
      'Czynsz marzec Kowalski',
    ])

    expect(result.bank).toBe('Millennium (PDF)')
    expect(result.skipped).toBe(0)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]).toMatchObject({
      date: '2026-03-05',
      amount: 1234.56,
      title: 'Czynsz marzec Kowalski',
      bankAccount: '12345678901234567890123456',
    })
  })

  test('kwota z ujemnym znakiem trafia do skippedTransactions', async () => {
    const result = await parse([
      '2026-03-06 2026-03-06 PRZELEW WYCHODZĄCY 500,00- 10.734,56',
      'Na R-k: 98 7654 3210 9876 5432 1098 7654',
      'Opłata za prąd',
    ])

    expect(result.transactions).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.skippedTransactions[0]).toMatchObject({ amount: -500, bankAccount: '98765432109876543210987654' })
  })

  test('kilka transakcji — każda dostaje własny opis i rachunek', async () => {
    const result = await parse([
      '2026-03-05 2026-03-05 PRZELEW PRZYCHODZĄCY 1.000,00 2.000,00',
      'Z R-ku: 11111111111111111111111111',
      'Pierwsza',
      '2026-03-07 2026-03-07 PRZELEW PRZYCHODZĄCY 250,50 2.250,50',
      'Z R-ku: 22222222222222222222222222',
      'Druga',
    ])

    expect(result.transactions.map((t) => [t.title, t.amount, t.bankAccount])).toEqual([
      ['Pierwsza', 1000, '11111111111111111111111111'],
      ['Druga', 250.5, '22222222222222222222222222'],
    ])
  })

  test('opis rozbity na kilka linii jest sklejany', async () => {
    const result = await parse([
      '2026-03-05 2026-03-05 PRZELEW PRZYCHODZĄCY 100,00 200,00',
      'Z R-ku: 11111111111111111111111111',
      'Czynsz za',
      'marzec lokal 5',
    ])
    expect(result.transactions[0].title).toBe('Czynsz za marzec lokal 5')
  })

  test('ignoruje nagłówki, stopki i podsumowania', async () => {
    const result = await parse([
      'www.bankmillennium.pl Wyciąg nr 3/2026',
      'DATA',
      'KSIĘG.',
      'SALDO POCZĄTKOWE: 10.000,00',
      '2026-03-05 2026-03-05 PRZELEW PRZYCHODZĄCY 100,00 10.100,00',
      'Z R-ku: 11111111111111111111111111',
      'Wpłata',
      'strona 1 z 2',
      'SALDO KOŃCOWE: 10.100,00',
      'PODSUMOWANIE',
    ])
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].title).toBe('Wpłata')
  })

  test('pusty dokument -> brak transakcji', async () => {
    const result = await parse([''])
    expect(result).toMatchObject({ transactions: [], skipped: 0, skippedTransactions: [] })
  })

  test('brak rachunku nadawcy -> bankAccount undefined', async () => {
    const result = await parse(['2026-03-05 2026-03-05 WPŁATA WŁASNA 100,00 200,00', 'Opis'])
    expect(result.transactions[0].bankAccount).toBeUndefined()
  })
})
