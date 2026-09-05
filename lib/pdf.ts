import PDFDocument from 'pdfkit-table'
import { StatementEntry } from '@/types/app'
import { formatAmount, formatDate } from '@/lib/utils'

import path from 'path'

function entryKind(entry: StatementEntry): string {
  const CATEGORY_LABELS: Record<string, string> = { RENT: 'Czynsz', MEDIA: 'Media', OTHER: 'Inne' }
  if (entry.type === 'invoice') return CATEGORY_LABELS[entry.invoiceType ?? ''] ?? 'Rachunek'
  if (entry.transactionCategory) return `Wpłata (${CATEGORY_LABELS[entry.transactionCategory] ?? entry.transactionCategory})`
  return 'Wpłata'
}

export async function generateStatementPdfBuffer(tenantName: string, entries: StatementEntry[], balance: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' })
      const fontRegular = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf')
      const fontBold = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Bold.ttf')
      
      doc.registerFont('Roboto', fontRegular)
      doc.registerFont('Roboto-Bold', fontBold)
      
      doc.font('Roboto')
      const chunks: Buffer[] = []
      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      doc.fontSize(16).text(`Wyciąg z konta najemcy: ${tenantName}`, { align: 'center' })
      doc.moveDown()
      
      const printDate = new Date().toLocaleDateString('pl-PL')
      doc.fontSize(10).text(`Wygenerowano: ${printDate}`, { align: 'right' })
      doc.moveDown()

      const table = {
        title: "Historia operacji",
        headers: ["Data", "Rodzaj", "Opis", "Kwota", "Saldo"],
        rows: entries.map(e => [
          formatDate(e.date),
          entryKind(e),
          e.description || '',
          formatAmount(e.amount),
          formatAmount(e.runningBalance)
        ])
      }

      doc.table(table, {
        prepareHeader: () => doc.font('Roboto-Bold').fontSize(10),
        prepareRow: () => doc.font('Roboto').fontSize(10)
      })

      doc.moveDown()
      doc.font('Roboto-Bold').fontSize(12).text(`Saldo bieżące: ${formatAmount(balance)}`, { align: 'right' })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

export async function generateMockupNotaPdfBuffer(
  tenantName: string,
  amount: number,
  month: number,
  year: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' })
      const fontRegular = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf')
      const fontBold = path.join(process.cwd(), 'public', 'fonts', 'Roboto-Bold.ttf')
      
      doc.registerFont('Roboto', fontRegular)
      doc.registerFont('Roboto-Bold', fontBold)
      
      doc.font('Roboto')

      const chunks: Buffer[] = []
      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      doc.fontSize(20).text('NOTA ROZLICZENIOWA (MOCKUP)', { align: 'center' })
      doc.moveDown(2)
      
      doc.fontSize(12).text(`Data wystawienia: ${new Date().toLocaleDateString('pl-PL')}`, { align: 'right' })
      doc.moveDown(2)

      doc.fontSize(14).text(`Nabywca: ${tenantName}`)
      doc.moveDown(1)
      doc.text(`Tytułem: Rozliczenie mediów za ${month}/${year}`)
      doc.moveDown(2)

      doc.fontSize(16).font('Roboto-Bold').text(`Kwota do zapłaty: ${formatAmount(amount)}`, { align: 'center' })
      doc.moveDown(4)
      
      doc.fontSize(10).font('Roboto').text('To jest tymczasowy dokument wygenerowany automatycznie. Docelowy format noty zostanie tu podpięty wkrótce.', { align: 'center', color: 'gray' })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
