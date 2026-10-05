import { contractCoversPeriod } from '@/lib/contracts'

/**
 * Czysta logika zakładki "Rozlicz w przeszłości" (wsteczne dopisywanie
 * czynszów), wydzielona z actions.ts żeby dało się ją testować jednostkowo.
 */

export type YearMonth = { month: number; year: number }

// Maksymalna liczba miesięcy w jednym przebiegu - zabezpieczenie przed
// przypadkowym wybraniem np. 2015-2026 i utworzeniem setek obciążeń naraz.
export const MAX_BACKFILL_MONTHS = 120

function toIndex({ month, year }: YearMonth): number {
  return year * 12 + (month - 1)
}

/**
 * Wszystkie miesiące od `from` do `to` WŁĄCZNIE (np. 05-10 -> 6 miesięcy).
 * Zwraca pustą tablicę, gdy `from` jest po `to`.
 */
export function monthsInRange(from: YearMonth, to: YearMonth): YearMonth[] {
  const start = toIndex(from)
  const end = toIndex(to)
  const result: YearMonth[] = []
  for (let i = start; i <= end; i++) {
    result.push({ month: (i % 12) + 1, year: Math.floor(i / 12) })
  }
  return result
}

/**
 * Czy umowa obowiązywała w danym miesiącu - na podstawie dat, a nie flagi
 * is_active (umowa dziś nieaktywna mogła obowiązywać w przeszłości).
 * Umowa nieaktywna BEZ end_date jest pomijana - nie wiadomo, kiedy się
 * skończyła, więc nie zgadujemy.
 */
export function contractCoversMonth(
  contract: { start_date: string; end_date: string | null; is_active: boolean },
  { month, year }: YearMonth,
): boolean {
  if (!contract.is_active && !contract.end_date) return false
  const [startYear, startMonth] = contract.start_date.split('-').map(Number)
  const startsBeforeOrIn = startYear < year || (startYear === year && startMonth <= month)
  return startsBeforeOrIn && contractCoversPeriod(contract.end_date, month, year)
}

/**
 * Umowa, do której podpinamy historyczny rachunek za media w danym miesiącu:
 * spośród umów obowiązujących w tym miesiącu preferujemy tę z
 * has_media_invoice, w razie remisu najnowszą (najpóźniejszy start).
 */
export function pickContractForMonth<
  T extends { id: number; start_date: string; end_date: string | null; is_active: boolean; has_media_invoice: boolean },
>(contracts: T[], ym: YearMonth): T | null {
  const covering = contracts.filter((c) => contractCoversMonth(c, ym))
  if (!covering.length) return null
  return [...covering].sort(
    (a, b) =>
      Number(b.has_media_invoice) - Number(a.has_media_invoice) || b.start_date.localeCompare(a.start_date),
  )[0]
}

/**
 * Parsuje kwotę wpisaną przez użytkownika ("123,45", "1 200.5").
 * Puste pole -> null (miesiąc pomijany), nieprawidłowa lub <= 0 -> NaN.
 */
export function parseAmountInput(input: string): number | null {
  const normalized = input.replace(/\s/g, '').replace(',', '.')
  if (!normalized) return null
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN
  const value = Number(normalized)
  return value > 0 ? value : NaN
}
