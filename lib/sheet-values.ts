// Przecinek dziesiętny -> kropka tylko w wartościach liczbowych ("120,5" -> "120.5").
// Teksty (np. adres "lok. 3, ul. Wodna 5") trafiają do arkusza bez zmian.
const DECIMAL_COMMA = /^\s*-?\d[\d\s ]*,\d+\s*$/

export function normalizeSheetValue(v: string | number): string | number {
  return typeof v === 'string' && DECIMAL_COMMA.test(v) ? v.replace(',', '.') : v
}
