'use client'

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getRentPreview, generateRents, getRentInvoices } from './actions'
import { tenantDisplayName } from '@/lib/utils'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { MonthYearPicker } from '@/components/month-year-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { formatAmount } from '@/lib/utils'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type Invoice = Awaited<ReturnType<typeof getRentInvoices>>[number]
type SortKey = 'number' | 'tenant' | 'amount'
type SortDir = 'asc' | 'desc'

const FILTER_COLUMNS = [
  { key: 'number', label: 'Numer' },
  { key: 'tenant', label: 'Najemca' },
]

function getTenantData(inv: Invoice) {
  return inv.tenants as unknown as { first_name: string; last_name: string; tenant_type?: string | null; company_name?: string | null } | null
}

function sortInvoices(invoices: Invoice[], key: SortKey, dir: SortDir): Invoice[] {
  return [...invoices].sort((a, b) => {
    const ta = getTenantData(a)
    const tb = getTenantData(b)
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'number') {
      va = a.number ?? ''
      vb = b.number ?? ''
    } else if (key === 'tenant') {
      va = ta ? tenantDisplayName(ta).toLowerCase() : ''
      vb = tb ? tenantDisplayName(tb).toLowerCase() : ''
    } else if (key === 'amount') {
      va = Number(a.amount)
      vb = Number(b.amount)
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesInvoiceFilter(inv: Invoice, text: string, col: string): boolean {
  const q = text.toLowerCase()
  const t = getTenantData(inv)
  const tenant = t ? tenantDisplayName(t).toLowerCase() : ''
  const number = (inv.number ?? '').toLowerCase()
  if (col === '__all__') return number.includes(q) || tenant.includes(q)
  if (col === 'number') return number.includes(q)
  if (col === 'tenant') return tenant.includes(q)
  return false
}

export default function FinancePage() {
  const now = new Date()
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getRentPreview>> | null>(null)
  const [progress, setProgress] = useState(0)
  const [pending, startTransition] = useTransition()
  const [sortKey, setSortKey] = useState<SortKey>('number')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterText, setFilterText] = useState('')
  const [filterCol, setFilterCol] = useState('__all__')

  const { data: invoices = [] } = useQuery({
    queryKey: QUERY_KEYS.rentInvoices(month, year),
    queryFn: () => getRentInvoices(month, year),
    staleTime: 2 * 60 * 1000,
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />
  }

  const filtered = filterText
    ? invoices.filter((inv) => matchesInvoiceFilter(inv, filterText, filterCol))
    : invoices
  const sorted = sortInvoices(filtered, sortKey, sortDir)

  function handlePreview() {
    startTransition(async () => {
      const p = await getRentPreview(month, year)
      setPreview(p)
      setConfirmOpen(true)
    })
  }

  function handleGenerate() {
    const total = (preview?.withEmail?.length ?? 0) + (preview?.withoutEmail?.length ?? 0)

    setProgress(0)
    const interval = setInterval(() => {
      setProgress((p) => {
        const delta = (95 - p) * 0.05
        return Math.min(p + delta, 94)
      })
    }, 200)

    startTransition(async () => {
      try {
        const results = await generateRents(month, year)
        clearInterval(interval)
        setProgress(100)
        toast.success(`Wystawiono ${results.length} czynszów.`)
        setConfirmOpen(false)
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rentInvoices(month, year) })
      } catch {
        clearInterval(interval)
        setProgress(0)
        toast.error('Błąd podczas wystawiania czynszów.')
      }
    })
  }

  const previewTotal =
    (preview?.withEmail?.length ?? 0) + (preview?.withoutEmail?.length ?? 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Finanse — czynsze</h1>
      </div>

      <div className="flex items-center gap-4">
        <MonthYearPicker
          month={month}
          year={year}
          onMonthChange={setMonth}
          onYearChange={setYear}
        />
        <Button onClick={handlePreview} disabled={pending}>
          Wystaw czynsze
        </Button>
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
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('number')}>
              Numer<SortIcon col="number" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenant')}>
              Najemca<SortIcon col="tenant" />
            </TableHead>
            <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('amount')}>
              Kwota<SortIcon col="amount" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((inv) => {
            const tenant = getTenantData(inv)
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-mono">{inv.number}</TableCell>
                <TableCell>
                  {tenant ? tenantDisplayName(tenant) : ''}
                </TableCell>
                <TableCell className="text-right">{formatAmount(Number(inv.amount))}</TableCell>
              </TableRow>
            )
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : `Brak czynszów dla ${month}/${year}`}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdzenie — {month}/{year}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium mb-1">
                Z e-mailem ({preview?.withEmail?.length ?? 0}):
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {(preview?.withEmail ?? []).map((c) => {
                  const t = c.tenants as unknown as { first_name: string; last_name: string; tenant_type?: string | null; company_name?: string | null } | null
                  const senderAcc = ((c.tenants as unknown as { sender_account?: number | null })?.sender_account ?? 1) === 2 ? 2 : 1
                  const senderEmail = senderAcc === 2 ? preview?.senderEmail2 : preview?.senderEmail1
                  return (
                    <li key={c.id}>
                      {t ? tenantDisplayName(t) : ''} — {formatAmount(Number(c.rent_amount))}
                      {senderEmail && (
                        <span className="text-xs ml-1 opacity-60">({senderEmail})</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
            {(preview?.withoutEmail?.length ?? 0) > 0 && (
              <div>
                <p className="font-medium mb-1">
                  Bez e-maila ({preview?.withoutEmail?.length ?? 0}):
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {(preview?.withoutEmail ?? []).map((c) => {
                    const t = c.tenants as unknown as {
                      first_name: string
                      last_name: string
                      tenant_type?: string | null
                      company_name?: string | null
                    } | null
                    return (
                      <li key={c.id}>
                        {t ? tenantDisplayName(t) : ''} — {formatAmount(Number(c.rent_amount))}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {progress > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleGenerate} disabled={pending || previewTotal === 0}>
              Wystaw ({previewTotal})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
