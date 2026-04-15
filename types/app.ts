export type TenantType = 'PRIVATE' | 'BUSINESS'
export type ContractType = 'PRIVATE' | 'BUSINESS'
export type InvoiceType = 'RENT' | 'MEDIA' | 'OTHER'
export type TransactionType = 'BANK' | 'CASH' | 'ADJUSTMENT'
export type TransactionStatus = 'MATCHED' | 'UNMATCHED' | 'MANUAL' | 'DISMISSED'
export type MonthlyTaskType = 'RENT' | 'MEDIA'
export type MonthlyTaskStatus = 'TODO' | 'DONE'

export interface StatementEntry {
  id: string
  date: string
  description: string
  amount: number
  runningBalance: number
  isPaid: boolean
  type: 'invoice' | 'transaction'
}

export interface ParsedTransaction {
  date: string
  title: string
  amount: number
  bankAccount?: string
  description?: string
}
