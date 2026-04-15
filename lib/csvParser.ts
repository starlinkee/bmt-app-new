import Papa from 'papaparse'
import type { ParsedTransaction } from '@/types/app'

// Normalizacja kwoty z formatu polskiego: "1 234,56" lub "-1 234,56" → number
function parsePolishAmount(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(',', '.'))
}

// Normalizacja daty do ISO YYYY-MM-DD
function parseDate(raw: string): string {
  raw = raw.trim()
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // DD.MM.YYYY | DD-MM-YYYY | DD/MM/YYYY
  const m = raw.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return raw
}

interface BankConfig {
  dateCol: string
  titleCol: string
  amountCol: string
  accountCol?: string
  headers: string[]
}

function detectBank(headers: string[]): BankConfig | null {
  const h = headers.map((s) => s.trim().toLowerCase())

  // PKO BP
  if (h.includes('data operacji') && h.includes('opis transakcji') && h.includes('kwota')) {
    return { dateCol: 'Data operacji', titleCol: 'Opis transakcji', amountCol: 'Kwota', accountCol: 'Rachunek nadawcy/odbiorcy', headers }
  }
  // mBank
  if (h.includes('#data operacji') || h.includes('data operacji') && h.includes('tytuł')) {
    return { dateCol: '#Data operacji', titleCol: 'Tytuł', amountCol: 'Kwota', accountCol: 'Numer rachunku', headers }
  }
  // Santander
  if (h.includes('data księgowania') && h.includes('opis')) {
    return { dateCol: 'Data księgowania', titleCol: 'Opis', amountCol: 'Kwota transakcji', headers }
  }
  // ING
  if (h.includes('data transakcji') && h.includes('tytuł') && h.includes('kwota transakcji (pln)')) {
    return { dateCol: 'Data transakcji', titleCol: 'Tytuł', amountCol: 'Kwota transakcji (PLN)', accountCol: 'Rachunek nadawcy/odbiorcy', headers }
  }
  // Millennium
  if (h.includes('data transakcji') && h.includes('opis') && h.includes('obciążenia') || h.includes('uznania')) {
    return { dateCol: 'Data transakcji', titleCol: 'Opis', amountCol: 'Obciążenia', headers }
  }
  // fallback — guess
  const dateKey = headers.find((h) => /data/i.test(h))
  const titleKey = headers.find((h) => /tytu[łl]|opis|opis transakcji/i.test(h))
  const amountKey = headers.find((h) => /kwota/i.test(h))
  if (dateKey && titleKey && amountKey) {
    return { dateCol: dateKey, titleCol: titleKey, amountCol: amountKey, headers }
  }
  return null
}

export interface CsvImportResult {
  bank: string
  transactions: ParsedTransaction[]
  skipped: number
}

export function parseCsv(csvContent: string): CsvImportResult {
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  })

  if (!result.data.length) {
    // Try comma
    const r2 = Papa.parse<Record<string, string>>(csvContent, {
      header: true,
      skipEmptyLines: true,
    })
    result.data = r2.data
    result.meta = r2.meta
  }

  const headers = result.meta.fields ?? []
  const config = detectBank(headers)
  const bank = config ? 'Rozpoznany' : 'Nieznany'

  const transactions: ParsedTransaction[] = []
  let skipped = 0

  for (const row of result.data) {
    const dateRaw = config ? row[config.dateCol] : undefined
    const titleRaw = config ? row[config.titleCol] : undefined
    const amountRaw = config ? row[config.amountCol] : undefined
    const accountRaw = config?.accountCol ? row[config.accountCol] : undefined

    if (!dateRaw || !amountRaw) {
      skipped++
      continue
    }

    const amount = parsePolishAmount(amountRaw)
    if (isNaN(amount) || amount === 0) {
      skipped++
      continue
    }

    transactions.push({
      date: parseDate(dateRaw),
      title: titleRaw?.trim() ?? '',
      amount,
      bankAccount: accountRaw?.trim() || undefined,
    })
  }

  return { bank, transactions, skipped }
}
