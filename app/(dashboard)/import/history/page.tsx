'use client'

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getAllTransactions, updateTransactionCategory } from '../actions'
import { formatAmount, formatDate, formatDateTime } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { ArrowLeft, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  MATCHED: 'Dopasowana',
  MANUAL: 'Ręczna',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  MATCHED: 'default',
  MANUAL: 'outline',
}

type Transaction = Awaited<ReturnType<typeof getAllTransactions>>[number]
type SortKey = 'date' | 'title' | 'bank_account' | 'tenant' | 'amount' | 'status' | 'created_at' | 'category'
type SortDir = 'asc' | 'desc'

const FILTER_COLUMNS = [
  { key: 'title', label: 'Tytuł' },
  { key: 'tenant', label: 'Najemca' },
  { key: 'bank_account', label: 'Konto nadawcy' },
  { key: 'status', label: 'Status' },
]

const STATUSES = ['MATCHED', 'MANUAL']

function sortTransactions(txs: Transaction[], key: SortKey, dir: SortDir): Transaction[] {
  return [...txs].sort((a, b) => {
    const ta = a.tenants as unknown as { first_name: string; last_name: string } | null
    const tb = b.tenants as unknown as { first_name: string; last_name: string } | null
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'date') {
      va = a.date
      vb = b.date
    } else if (key === 'title') {
      va = (a.title ?? '').toLowerCase()
      vb = (b.title ?? '').toLowerCase()
    } else if (key === 'bank_account') {
      va = (a.bank_account ?? '').toLowerCase()
      vb = (b.bank_account ?? '').toLowerCase()
    } else if (key === 'tenant') {
      va = ta ? `${ta.last_name} ${ta.first_name}`.toLowerCase() : ''
      vb = tb ? `${tb.last_name} ${tb.first_name}`.toLowerCase() : ''
    } else if (key === 'amount') {
      va = Number(a.amount)
      vb = Number(b.amount)
    } else if (key === 'status') {
      va = (a.status ?? '').toLowerCase()
      vb = (b.status ?? '').toLowerCase()
    } else if (key === 'created_at') {
      va = a.created_at ?? ''
      vb = b.created_at ?? ''
    } else if (key === 'category') {
      va = ((a as unknown as { category?: string | null }).category ?? '').toLowerCase()
      vb = ((b as unknown as { category?: string | null }).category ?? '').toLowerCase()
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesTxFilter(tx: Transaction, text: string, col: string): boolean {
  const q = text.toLowerCase()
  const tenant = tx.tenants as unknown as { first_name: string; last_name: string } | null
  const tenantName = tenant ? `${tenant.first_name} ${tenant.last_name}`.toLowerCase() : ''
  const title = (tx.title ?? '').toLowerCase()
  const account = (tx.bank_account ?? '').toLowerCase()
  const status = (STATUS_LABELS[tx.status ?? ''] ?? tx.status ?? '').toLowerCase()
  if (col === '__all__') return title.includes(q) || tenantName.includes(q) || account.includes(q) || status.includes(q)
  if (col === 'title') return title.includes(q)
  if (col === 'tenant') return tenantName.includes(q)
  if (col === 'bank_account') return account.includes(q)
  if (col === 'status') return status.includes(q)
  return false
}

function CategoryCell({ tx }: { tx: Transaction }) {
  const category = (tx as unknown as { category?: string | null }).category
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const queryClient = useQueryClient()

  function select(cat: 'RENT' | 'MEDIA') {
    startTransition(async () => {
      await updateTransactionCategory(tx.id, cat)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setOpen(false)
    })
  }

  if (open) {
    return (
      <div className="flex gap-1">
        <button
          onClick={() => select('RENT')}
          disabled={pending}
          className="px-2 py-0.5 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors"
        >
          Czynsz
        </button>
        <button
          onClick={() => select('MEDIA')}
          disabled={pending}
          className="px-2 py-0.5 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors"
        >
          Media
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={pending}
          className="px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
    )
  }

  if (category === 'RENT') {
    return (
      <button onClick={() => setOpen(true)} className="group">
        <Badge variant="secondary" className="cursor-pointer group-hover:opacity-70 transition-opacity">
          Czynsz
        </Badge>
      </button>
    )
  }
  if (category === 'MEDIA') {
    return (
      <button onClick={() => setOpen(true)} className="group">
        <Badge variant="outline" className="cursor-pointer group-hover:opacity-70 transition-opacity">
          Media
        </Badge>
      </button>
    )
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="text-xs text-muted-foreground underline decoration-dotted hover:text-foreground transition-colors"
    >
      brak
    </button>
  )
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey, sortKey: SortKey, sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
  return sortDir === 'asc'
    ? <ChevronUp className="ml-1 h-3 w-3 inline" />
    : <ChevronDown className="ml-1 h-3 w-3 inline" />
}

export default function TransactionHistoryPage() {
  const searchParams = useSearchParams()
  const status = searchParams.get('status') ?? undefined

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', status],
    queryFn: () => getAllTransactions(status),
  })

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterText, setFilterText] = useState('')
  const [filterCol, setFilterCol] = useState('__all__')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = filterText
    ? transactions.filter((tx) => matchesTxFilter(tx, filterText, filterCol))
    : transactions
  const sorted = sortTransactions(filtered, sortKey, sortDir)

  const nullCount = sorted.filter(
    (tx) => !(tx as unknown as { category?: string | null }).category
  ).length

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/import"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Import
        </Link>
        <h1 className="text-2xl font-semibold">Historia transakcji bankowych</h1>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/import/history"
          className={`inline-flex items-center justify-center h-7 rounded px-3 text-xs border transition-colors ${
            !status ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
          }`}
        >
          Wszystkie
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/import/history?status=${s}`}
            className={`inline-flex items-center justify-center h-7 rounded px-3 text-xs border transition-colors ${
              status === s ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">{sorted.length} transakcji</p>
        {nullCount > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {nullCount} bez kategorii — kliknij &quot;brak&quot; żeby przypisać
          </p>
        )}
      </div>

      <TableFilterBar
        value={filterText}
        onChange={setFilterText}
        column={filterCol}
        onColumnChange={setFilterCol}
        columns={FILTER_COLUMNS}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('date')}>
              Data<SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('title')}>
              Tytuł<SortIcon col="title" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('bank_account')}>
              Konto nadawcy<SortIcon col="bank_account" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenant')}>
              Najemca<SortIcon col="tenant" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('amount')}>
              Kwota<SortIcon col="amount" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('category')}>
              Rodzaj<SortIcon col="category" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('status')}>
              Status<SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('created_at')}>
              Dodano<SortIcon col="created_at" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((tx) => {
            const tenant = tx.tenants as unknown as { first_name: string; last_name: string } | null
            return (
              <TableRow key={tx.id}>
                <TableCell className="text-sm whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                <TableCell className="text-sm max-w-56 truncate">{tx.title || '—'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {tx.bank_account || '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {tenant ? (
                    <Link
                      href={`/tenants/${tx.tenant_id}`}
                      className="hover:underline"
                    >
                      {tenant.first_name} {tenant.last_name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm font-medium text-green-600">
                  {formatAmount(Number(tx.amount))}
                </TableCell>
                <TableCell>
                  <CategoryCell tx={tx} />
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[tx.status ?? 'UNMATCHED']}>
                    {STATUS_LABELS[tx.status ?? 'UNMATCHED']}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {tx.created_at ? formatDateTime(tx.created_at) : '—'}
                </TableCell>
              </TableRow>
            )
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : 'Brak transakcji'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
