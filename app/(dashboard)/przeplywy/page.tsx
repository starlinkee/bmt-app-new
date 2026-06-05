'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAllFlows, getFirstTransactionDate } from './actions'
import { formatAmount, formatDate } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 2030 - (CURRENT_YEAR - 4) + 1 }, (_, i) => 2030 - i)

const TYPE_LABELS: Record<string, string> = {
  RENT: 'Czynsz',
  MEDIA: 'Media',
  OTHER: 'Inny',
}

const TENANT_TYPE_LABELS: Record<string, string> = {
  PRIVATE: 'Prywatny',
  BUSINESS: 'Firma',
}

type Entry = Awaited<ReturnType<typeof getAllFlows>>[number]
type SortKey = 'date' | 'type' | 'tenant' | 'tenantType' | 'description' | 'amount'
type SortDir = 'asc' | 'desc'

const FILTER_COLUMNS = [
  { key: 'tenant', label: 'Najemca' },
  { key: 'description', label: 'Opis' },
  { key: 'type', label: 'Typ' },
]

function getTypeLabel(entry: Entry): string {
  if (entry.type === 'invoice') {
    return entry.invoiceType ? (TYPE_LABELS[entry.invoiceType] ?? entry.invoiceType) : 'Rachunek'
  }
  if (entry.transactionCategory) {
    return `Wpłata (${TYPE_LABELS[entry.transactionCategory] ?? entry.transactionCategory})`
  }
  return 'Wpłata (bez kategorii)'
}

function sortEntries(entries: Entry[], key: SortKey, dir: SortDir): Entry[] {
  return [...entries].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'date') {
      va = a.date
      vb = b.date
    } else if (key === 'type') {
      va = getTypeLabel(a).toLowerCase()
      vb = getTypeLabel(b).toLowerCase()
    } else if (key === 'tenant') {
      va = (a.tenantName ?? '').toLowerCase()
      vb = (b.tenantName ?? '').toLowerCase()
    } else if (key === 'tenantType') {
      va = (a.tenantType ?? '').toLowerCase()
      vb = (b.tenantType ?? '').toLowerCase()
    } else if (key === 'description') {
      va = (a.description ?? '').toLowerCase()
      vb = (b.description ?? '').toLowerCase()
    } else if (key === 'amount') {
      va = a.amount
      vb = b.amount
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesEntryFilter(entry: Entry, text: string, col: string): boolean {
  const q = text.toLowerCase()
  const tenant = (entry.tenantName ?? '').toLowerCase()
  const description = (entry.description ?? '').toLowerCase()
  const type = getTypeLabel(entry).toLowerCase()
  if (col === '__all__') return tenant.includes(q) || description.includes(q) || type.includes(q)
  if (col === 'tenant') return tenant.includes(q)
  if (col === 'description') return description.includes(q)
  if (col === 'type') return type.includes(q)
  return false
}

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Wszystko' },
  { value: 'RENT', label: 'Czynsz' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'transaction', label: 'Wpłaty' },
] as const

const TENANT_TYPE_OPTIONS = [
  { value: 'all', label: 'Wszyscy' },
  { value: 'PRIVATE', label: 'Prywatni' },
  { value: 'BUSINESS', label: 'Firmy' },
] as const

export default function PrzeplywyPage() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [typeFilter, setTypeFilter] = useState<'all' | 'RENT' | 'MEDIA' | 'transaction'>('all')
  const [tenantTypeFilter, setTenantTypeFilter] = useState<'all' | 'PRIVATE' | 'BUSINESS'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterText, setFilterText] = useState('')
  const [filterCol, setFilterCol] = useState('__all__')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['przeplywy', year],
    queryFn: () => getAllFlows(year),
    staleTime: 2 * 60 * 1000,
  })

  const { data: firstTransactionDate } = useQuery({
    queryKey: ['firstTransactionDate'],
    queryFn: getFirstTransactionDate,
    staleTime: Infinity,
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

  const categoryFiltered = entries.filter((e) => {
    if (typeFilter === 'all') return true
    if (typeFilter === 'transaction') return e.type === 'transaction'
    if (typeFilter === 'RENT') return e.type === 'invoice' && e.invoiceType === 'RENT'
    if (typeFilter === 'MEDIA') return e.type === 'invoice' && e.invoiceType === 'MEDIA'
    return true
  })
  const tenantFiltered = tenantTypeFilter === 'all'
    ? categoryFiltered
    : categoryFiltered.filter((e) => e.tenantType === tenantTypeFilter)
  const textFiltered = filterText
    ? tenantFiltered.filter((e) => matchesEntryFilter(e, filterText, filterCol))
    : tenantFiltered
  const visible = sortEntries(textFiltered, sortKey, sortDir)

  const totalIn = tenantFiltered.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const totalOut = tenantFiltered.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const net = totalIn - totalOut

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Przepływy</h1>

        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Wpłaty (wchodzące)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatAmount(totalIn)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Rachunki (wychodzące)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatAmount(totalOut)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Bilans netto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${net >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {formatAmount(net)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Kontrolujemy od
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {firstTransactionDate ? formatDate(firstTransactionDate) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <TableFilterBar
        value={filterText}
        onChange={setFilterText}
        column={filterCol}
        onColumnChange={setFilterCol}
        columns={FILTER_COLUMNS}
      />

      <div className="flex flex-wrap gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kategoria</p>
          <div className="flex gap-1">
            {CATEGORY_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={typeFilter === opt.value ? 'default' : 'outline'}
                onClick={() => setTypeFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Typ najemcy</p>
          <div className="flex gap-1">
            {TENANT_TYPE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={tenantTypeFilter === opt.value ? 'default' : 'outline'}
                onClick={() => setTenantTypeFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('date')}>
              Data<SortIcon col="date" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')}>
              Typ<SortIcon col="type" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenant')}>
              Najemca<SortIcon col="tenant" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenantType')}>
              Typ najemcy<SortIcon col="tenantType" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('description')}>
              Opis<SortIcon col="description" />
            </TableHead>
            <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('amount')}>
              Kwota<SortIcon col="amount" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Ładowanie…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : `Brak operacji dla ${year}`}
              </TableCell>
            </TableRow>
          )}
          {visible.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {formatDate(entry.date)}
              </TableCell>
              <TableCell>
                {entry.type === 'invoice' ? (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${entry.invoiceType === 'RENT' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                    {entry.invoiceType ? (TYPE_LABELS[entry.invoiceType] ?? entry.invoiceType) : 'Rachunek'}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {getTypeLabel(entry)}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-sm">{entry.tenantName}</TableCell>
              <TableCell>
                {entry.tenantType ? (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${entry.tenantType === 'BUSINESS' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                    {TENANT_TYPE_LABELS[entry.tenantType] ?? entry.tenantType}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{entry.description}</TableCell>
              <TableCell
                className={`text-right text-sm font-medium ${
                  entry.amount >= 0 ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {entry.amount >= 0 ? '+' : ''}
                {formatAmount(entry.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
