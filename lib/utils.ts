import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Numeracja rachunków: MM/YYYY/NNN  (RENT+0, MEDIA+9, OTHER+19)
const INVOICE_TYPE_OFFSET: Record<string, number> = {
  RENT: 0,
  MEDIA: 9,
  OTHER: 19,
}

export function buildInvoiceNumber(
  month: number,
  year: number,
  seqNumber: number,
  type: string,
): string {
  const offset = INVOICE_TYPE_OFFSET[type] ?? 0
  const seq = String(seqNumber + offset).padStart(3, '0')
  const mm = String(month).padStart(2, '0')
  return `${mm}/${year}/${seq}`
}

export function formatAmount(amount: number): string {
  return (
    new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + ' zł'
  )
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}
