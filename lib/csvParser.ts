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
  bankName: string
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
    return { bankName: 'PKO BP', dateCol: 'Data operacji', titleCol: 'Opis transakcji', amountCol: 'Kwota', accountCol: 'Rachunek nadawcy/odbiorcy', headers }
  }
  // mBank
  if (h.includes('#data operacji') || (h.includes('data operacji') && h.includes('tytuł'))) {
    return { bankName: 'mBank', dateCol: '#Data operacji', titleCol: 'Tytuł', amountCol: 'Kwota', accountCol: 'Numer rachunku', headers }
  }
  // Format z Rachunek źródłowy / Rachunek docelowy (np. Alior, BNP, PKO nowy)
  if (h.includes('rachunek źródłowy') && h.includes('tytułem') && h.includes('kwota operacji')) {
    return { bankName: 'Bank (format źródłowy)', dateCol: 'Data księgowania', titleCol: 'Tytułem', amountCol: 'Kwota operacji', accountCol: 'Rachunek źródłowy', headers }
  }
  // Santander
  if (h.includes('data księgowania') && h.includes('opis')) {
    return { bankName: 'Santander', dateCol: 'Data księgowania', titleCol: 'Opis', amountCol: 'Kwota transakcji', headers }
  }
  // ING
  if (h.includes('data transakcji') && h.includes('tytuł') && h.includes('kwota transakcji (pln)')) {
    return { bankName: 'ING', dateCol: 'Data transakcji', titleCol: 'Tytuł', amountCol: 'Kwota transakcji (PLN)', accountCol: 'Rachunek nadawcy/odbiorcy', headers }
  }
  // Millennium
  if (h.includes('data transakcji') && h.includes('opis') && (h.includes('obciążenia') || h.includes('uznania'))) {
    return { bankName: 'Millennium', dateCol: 'Data transakcji', titleCol: 'Opis', amountCol: 'Obciążenia', headers }
  }
  // fallback — guess
  const dateKey = headers.find((h) => /data/i.test(h))
  const titleKey = headers.find((h) => /tytu[łl]|opis|opis transakcji/i.test(h))
  const amountKey = headers.find((h) => /kwota/i.test(h))
  if (dateKey && titleKey && amountKey) {
    return { bankName: 'Nieznany bank', dateCol: dateKey, titleCol: titleKey, amountCol: amountKey, headers }
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
  const bank = config ? config.bankName : 'Nierozpoznany bank'

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
    // Importujemy tylko przychodzące wpłaty (amount > 0); wychodzące pomijamy
    if (isNaN(amount) || amount <= 0) {
      skipped++
      continue
    }

    // Zbierz wszystkie niepuste pola z wiersza CSV jako raw_data
    const rawData: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      const v = value?.trim()
      if (v) rawData[key.trim()] = v
    }

    transactions.push({
      date: parseDate(dateRaw),
      title: titleRaw?.trim() ?? '',
      amount,
      bankAccount: accountRaw?.trim() || undefined,
      rawData,
    })
  }

  return { bank, transactions, skipped }
}
