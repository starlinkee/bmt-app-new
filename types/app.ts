export type TenantType = 'PRIVATE' | 'BUSINESS'
export type ContractType = 'PRIVATE' | 'BUSINESS'
export type InvoiceType = 'RENT' | 'MEDIA' | 'OTHER'
export type TransactionType = 'BANK' | 'CASH' | 'ADJUSTMENT'
export type TransactionStatus = 'MATCHED' | 'UNMATCHED' | 'MANUAL' | 'DISMISSED'
export interface StatementEntry {
  id: string
  date: string
  description: string
  amount: number
  runningBalance: number
  isPaid: boolean
  type: 'invoice' | 'transaction'
  invoiceType?: string
  transactionCategory?: string | null
  rawTxId?: number
  txStatus?: string
  hasAmendments?: boolean
}

export interface ParsedTransaction {
  date: string
  title: string
  amount: number
  bankAccount?: string
  description?: string
  rawData?: Record<string, string>
}
