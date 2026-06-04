import { describe, test, expect } from 'vitest'
import { matchTransaction } from '@/lib/matcher'

const tenants = [
  { id: 1, bank_accounts_as_text: '12 3456 7890 1234 5678 9012 3456' },
  { id: 2, bank_accounts_as_text: 'PL98765432109876543210987654\n11 2222 3333 4444 5555 6666 7777' },
  { id: 3, bank_accounts_as_text: 'PL00111122223333444455556666' },
]

describe('matchTransaction', () => {
  test('dopasowuje dokładny numer konta', () => {
    const result = matchTransaction('12345678901234567890123456', tenants)
    expect(result?.id).toBe(1)
  })

  test('ignoruje spacje w numerze konta', () => {
    const result = matchTransaction('12 3456 7890 1234 5678 9012 3456', tenants)
    expect(result?.id).toBe(1)
  })

  test('ignoruje prefix PL', () => {
    const result = matchTransaction('PL98765432109876543210987654', tenants)
    expect(result?.id).toBe(2)
  })

  test('dopasowuje drugi rachunek z listy (oddzielone \\n)', () => {
    const result = matchTransaction('11222233334444555566667777', tenants)
    expect(result?.id).toBe(2)
  })

  test('dopasowuje konto z PL w bazie przez suffix', () => {
    const result = matchTransaction('00111122223333444455556666', tenants)
    expect(result?.id).toBe(3)
  })

  test('zwraca null dla nierozpoznanego konta', () => {
    const result = matchTransaction('99999999999999999999999999', tenants)
    expect(result).toBeNull()
  })

  test('zwraca null dla undefined', () => {
    expect(matchTransaction(undefined, tenants)).toBeNull()
  })

  test('zwraca null dla null', () => {
    expect(matchTransaction(null, tenants)).toBeNull()
  })

  test('zwraca null dla pustego stringa', () => {
    expect(matchTransaction('', tenants)).toBeNull()
  })

  test('dopasowuje mimo myślników w przekazanym numerze', () => {
    const result = matchTransaction('12-3456-7890-1234-5678-9012-3456', tenants)
    expect(result?.id).toBe(1)
  })

  test('zwraca null gdy lista najemców jest pusta', () => {
    expect(matchTransaction('12345678901234567890123456', [])).toBeNull()
  })
})
