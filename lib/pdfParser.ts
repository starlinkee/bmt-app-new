// Uwaga: importujemy bezpośrednio z 'pdf-parse/lib/pdf-parse.js', a nie z 'pdf-parse'.
// Główny plik pakietu (index.js) zawiera kod debugowy uruchamiany, gdy `!module.parent`,
// który przy bundlowaniu przez Turbopack próbuje wczytać przykładowy plik testowy
// (./test/data/05-versions-space.pdf) i wywala aplikację błędem ENOENT.
// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-expect-error - brak typów dla 'pdf-parse/lib/pdf-parse.js'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import type { ParsedTransaction } from '@/types/app'

// Normalizacja kwoty: "1.234,56" lub "1 234,56" -> number
function parsePolishAmount(raw: string): number {
  return parseFloat(raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
}

export interface PdfImportResult {
  bank: string
  transactions: ParsedTransaction[]
  skipped: number
  skippedTransactions: ParsedTransaction[]
}

export async function parsePdf(pdfBuffer: Buffer): Promise<PdfImportResult> {
  const data = await pdfParse(pdfBuffer, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pagerender: function(pageData: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return pageData.getTextContent().then(function(textContent: any) {
        let lastY, text = ''
        for (const item of textContent.items) {
          if (lastY == item.transform[5] || !lastY) {
            text += item.str + ' '
          } else {
            text += '\n' + item.str + ' '
          }
          lastY = item.transform[5]
        }
        return text
      })
    }
  })

  const lines = data.text.split('\n').map((l: string) => l.trim())
  
  const transactions: ParsedTransaction[] = []
  const skippedTransactions: ParsedTransaction[] = []
  let skipped = 0

  let currentTx: ParsedTransaction | null = null
  let currentDesc: string[] = []
  let currentAccount = ''

  const txLineRegex = /^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.*?)\s+([\d.,]+)(-?)\s+([\d.,]+)\s*$/

  for (const line of lines) {
    if (!line) continue

    // Ignoruj nagłówki/stopki PDF
    if (line.includes('www.bankmillennium.pl') && line.includes('Wyciąg nr')) continue
    if (/^strona\s+\d+\s+z\s+\d+/.test(line)) continue
    if (line === 'DATA') continue
    if (line === 'KSIĘG.') continue
    if (line.includes('WAL.  OPIS TRANSAKCJI     WARTOŚĆ  SALDO')) continue
    if (line.startsWith('SALDO POCZĄTKOWE:')) continue
    if (line.startsWith('SALDO KOŃCOWE:')) continue
    if (line.startsWith('PODSUMOWANIE')) continue
    if (line.startsWith('TERMINARZ SPŁAT')) continue
    if (line.startsWith('RACHUNKI BIEŻĄCE - INFORMACJE SZCZEGÓŁOWE')) continue

    const match = line.match(txLineRegex)
    if (match) {
      // Zapisz poprzednią transakcję
      if (currentTx) {
        currentTx.title = currentDesc.join(' ').trim() || currentTx.title
        currentTx.bankAccount = currentAccount || undefined
        currentTx.rawData = { Typ: currentTx.rawData?.Typ || '', Opis: currentTx.title }
        
        if (currentTx.amount <= 0) {
          skipped++
          skippedTransactions.push(currentTx)
        } else {
          transactions.push(currentTx)
        }
      }

      // Rozpocznij nową transakcję
      const date = match[1]
      const type = match[3].trim()
      const amountStr = match[4]
      const isNegative = match[5] === '-'
      
      let amount = parsePolishAmount(amountStr)
      if (isNegative) amount = -amount

      currentTx = {
        date,
        title: type, // tymczasowo, nadpiszemy z opisu
        amount,
        rawData: { Typ: type },
      }
      currentDesc = []
      currentAccount = ''
    } else if (currentTx) {
      if (line.startsWith('Z R-ku:')) {
        currentAccount = line.substring(7).trim().replace(/\s/g, '')
      } else if (line.startsWith('Na R-k:')) {
        currentAccount = line.substring(7).trim().replace(/\s/g, '')
      } else if (line.startsWith('DATA NADANIA:')) {
        currentDesc.push(line)
      } else {
        currentDesc.push(line)
      }
    }
  }

  // Zapisz ostatnią transakcję
  if (currentTx) {
    currentTx.title = currentDesc.join(' ').trim() || currentTx.title
    currentTx.bankAccount = currentAccount || undefined
    currentTx.rawData = { Typ: currentTx.rawData?.Typ || '', Opis: currentTx.title }
    
    if (currentTx.amount <= 0) {
      skipped++
      skippedTransactions.push(currentTx)
    } else {
      transactions.push(currentTx)
    }
  }

  return { bank: 'Millennium (PDF)', transactions, skipped, skippedTransactions }
}
