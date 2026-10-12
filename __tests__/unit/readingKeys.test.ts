import { describe, test, expect } from 'vitest'
import { normalizeReadingEntries, readingKeysOf } from '@/lib/reading-keys'

describe('normalizeReadingEntries / readingKeysOf', () => {
  test('stary format: string -> klucz z etykietą bez podkreślników', () => {
    expect(normalizeReadingEntries(['woda_zimna'])).toEqual([{ key: 'woda_zimna', label: 'woda zimna' }])
  })

  test('obecny format: { key, label }; brak etykiety -> z klucza', () => {
    expect(normalizeReadingEntries([{ key: 'prad', label: 'Prąd' }, { key: 'gaz_ziemny' }])).toEqual([
      { key: 'prad', label: 'Prąd' },
      { key: 'gaz_ziemny', label: 'gaz ziemny' },
    ])
  })

  test('format mieszany', () => {
    expect(readingKeysOf(['a', { key: 'b', label: 'B' }])).toEqual(['a', 'b'])
  })

  test('brak / nie-tablica / śmieci -> []', () => {
    expect(readingKeysOf(undefined)).toEqual([])
    expect(readingKeysOf(null)).toEqual([])
    expect(readingKeysOf('x')).toEqual([])
    expect(readingKeysOf({ key: 'a' })).toEqual([])
    expect(readingKeysOf([null, 5, {}, { key: 3 }])).toEqual([])
  })
})
