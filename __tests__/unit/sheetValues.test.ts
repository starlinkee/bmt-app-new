import { describe, it, expect } from 'vitest'
import { normalizeSheetValue } from '@/lib/sheet-values'

describe('normalizeSheetValue', () => {
  it('zamienia przecinek dziesiętny na kropkę w liczbach', () => {
    expect(normalizeSheetValue('120,5')).toBe('120.5')
    expect(normalizeSheetValue('-3,25')).toBe('-3.25')
    expect(normalizeSheetValue('1 234,50')).toBe('1 234.50')
  })
  it('nie rusza adresu ani innych tekstów', () => {
    expect(normalizeSheetValue('lok. 3, ul. Wodna 5')).toBe('lok. 3, ul. Wodna 5')
    expect(normalizeSheetValue('Kowalski, Jan')).toBe('Kowalski, Jan')
  })
  it('nie rusza liczb i tekstów bez przecinka', () => {
    expect(normalizeSheetValue(12.5)).toBe(12.5)
    expect(normalizeSheetValue('120.5')).toBe('120.5')
  })
})
