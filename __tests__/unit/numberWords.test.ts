import { describe, test, expect } from 'vitest'
import { amountToWordsPLN } from '@/lib/numberWords'

// Ta funkcja trafia bezpośrednio na faktury — błędy mają skutki prawne.

describe('amountToWordsPLN - podstawowe przypadki', () => {
  test('zero', () => {
    expect(amountToWordsPLN(0)).toBe('zero złotych 00/100')
  })

  test('1 złoty — forma "złoty"', () => {
    expect(amountToWordsPLN(1)).toBe('jeden złoty 00/100')
  })

  test('2 złote — forma "złote"', () => {
    expect(amountToWordsPLN(2)).toBe('dwa złote 00/100')
  })

  test('5 złotych — forma "złotych"', () => {
    expect(amountToWordsPLN(5)).toBe('pięć złotych 00/100')
  })

  test('12 złotych — wyjątek nastolatki', () => {
    expect(amountToWordsPLN(12)).toBe('dwanaście złotych 00/100')
  })

  test('13 złotych', () => {
    expect(amountToWordsPLN(13)).toBe('trzynaście złotych 00/100')
  })

  test('14 złotych', () => {
    expect(amountToWordsPLN(14)).toBe('czternaście złotych 00/100')
  })

  test('21 złotych — forma "złotych" (wyjątek: kończy się na 1)', () => {
    expect(amountToWordsPLN(21)).toContain('złotych')
  })

  test('22 złote — forma "złote"', () => {
    expect(amountToWordsPLN(22)).toContain('złote')
  })

  test('100 złotych', () => {
    expect(amountToWordsPLN(100)).toBe('sto złotych 00/100')
  })

  test('200 złotych', () => {
    expect(amountToWordsPLN(200)).toBe('dwieście złotych 00/100')
  })
})

describe('amountToWordsPLN - tysiące', () => {
  test('1000 zł', () => {
    expect(amountToWordsPLN(1000)).toBe('tysiąc złotych 00/100')
  })

  test('2000 zł — "dwa tysiące"', () => {
    expect(amountToWordsPLN(2000)).toBe('dwa tysiące złotych 00/100')
  })

  test('5000 zł — "pięć tysięcy"', () => {
    expect(amountToWordsPLN(5000)).toBe('pięć tysięcy złotych 00/100')
  })

  test('12000 zł — wyjątek nastolatki "dwanaście tysięcy"', () => {
    expect(amountToWordsPLN(12000)).toBe('dwanaście tysięcy złotych 00/100')
  })

  test('1500 zł — tysiąc pięćset', () => {
    expect(amountToWordsPLN(1500)).toBe('tysiąc pięćset złotych 00/100')
  })

  test('2350 zł', () => {
    expect(amountToWordsPLN(2350)).toBe('dwa tysiące trzysta pięćdziesiąt złotych 00/100')
  })
})

describe('amountToWordsPLN - grosze', () => {
  test('1,50 zł — jeden złoty 50/100', () => {
    expect(amountToWordsPLN(1.50)).toBe('jeden złoty 50/100')
  })

  test('0,01 zł — tylko grosze', () => {
    expect(amountToWordsPLN(0.01)).toBe('zero złotych 01/100')
  })

  test('1500,99 zł', () => {
    expect(amountToWordsPLN(1500.99)).toBe('tysiąc pięćset złotych 99/100')
  })

  test('grosze z zaokrąglaniem (floating point)', () => {
    // 0.1 + 0.2 = 0.30000000004 — funkcja powinna to obsłużyć przez Math.round
    expect(amountToWordsPLN(0.1 + 0.2)).toBe('zero złotych 30/100')
  })
})

describe('amountToWordsPLN - typowe kwoty czynszów', () => {
  test('1 800 zł — typowy czynsz', () => {
    expect(amountToWordsPLN(1800)).toBe('tysiąc osiemset złotych 00/100')
  })

  test('2 450 zł', () => {
    expect(amountToWordsPLN(2450)).toBe('dwa tysiące czterysta pięćdziesiąt złotych 00/100')
  })

  test('3 200 zł', () => {
    expect(amountToWordsPLN(3200)).toBe('trzy tysiące dwieście złotych 00/100')
  })
})
