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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { FacetedFilter } from '@/components/ui/faceted-filter'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown, ChevronsUpDown, X } from 'lucide-react'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 2030 - (CURRENT_YEAR - 4) + 1 }, (_, i) => 2030 - i)

const TYPE_LABELS: Record<string, string> = {
  RENT: 'Czynsz',
  MEDIA: 'Media',
  OTHER: 'Inny',
}



type Entry = Awaited<ReturnType<typeof getAllFlows>>[number]
type SortKey = 'id' | 'date' | 'type' | 'tenant' | 'tenantType' | 'description' | 'amount'
type SortDir = 'asc' | 'desc'

function getTypeLabel(entry: Entry): string {
  if (entry.type === 'invoice') {
    return entry.invoiceType ? (TYPE_LABELS[entry.invoiceType] ?? entry.invoiceType) : 'Obciazenie'
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
    if (key === 'id') {
      va = a.id
      vb = b.id
    } else if (key === 'date') {
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

function matchesEntryFilter(entry: Entry, text: string): boolean {
  const q = text.toLowerCase()
  const tenant = (entry.tenantName ?? '').toLowerCase()
  const description = (entry.description ?? '').toLowerCase()
  const type = getTypeLabel(entry).toLowerCase()
  return tenant.includes(q) || description.includes(q) || type.includes(q)
}

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Wszystko' },
  { value: 'RENT', label: 'Czynsz' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'transaction', label: 'Wpłaty' },
] as const

const TYPE_OPTIONS = [
  { value: 'invoice', label: 'Obciążenie' },
  { value: 'transaction', label: 'Wpłata' },
] as const

function matchesDateRange(entry: Entry, from: string, to: string): boolean {
  const d = entry.date ?? ''
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}



function SortIcon({ col, sortKey, sortDir }: { col: SortKey, sortKey: SortKey, sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
  return sortDir === 'asc'
    ? <ChevronUp className="ml-1 h-3 w-3 inline" />
    : <ChevronDown className="ml-1 h-3 w-3 inline" />
}

export default function PrzeplywyPage() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterText, setFilterText] = useState('')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['przeplywy', year],
    queryFn: () => getAllFlows(year),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  useQuery({
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

  const [categories, setCategories] = useState<Set<string>>(new Set())
  const [entryTypes, setEntryTypes] = useState<Set<string>>(new Set())
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const categoryFiltered = entries.filter((e) => {
    if (categories.size === 0) return true
    const cat = e.type === 'transaction' ? 'transaction' : (e.invoiceType ?? 'OTHER')
    return categories.has(cat)
  })

  const typeFiltered = categoryFiltered.filter((e) => {
    if (entryTypes.size === 0) return true
    return entryTypes.has(e.type)
  })

  const selectedTenantsFiltered = typeFiltered.filter((e) => {
    if (selectedTenants.size === 0) return true
    return e.tenantName && selectedTenants.has(e.tenantName)
  })

  const dateFiltered = selectedTenantsFiltered.filter((e) => matchesDateRange(e, dateFrom, dateTo))

  const textFiltered = filterText
    ? dateFiltered.filter((e) => matchesEntryFilter(e, filterText))
    : dateFiltered

  const visible = sortEntries(textFiltered, sortKey, sortDir)
  const hasDates = !!(dateFrom || dateTo)

  const totalIn = dateFiltered.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const totalOut = dateFiltered.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const net = totalIn - totalOut

  // Compute unique tenants for filter
  const uniqueTenants = Array.from(new Set(entries.map(e => e.tenantName).filter(Boolean) as string[])).sort()

  return (
    <div className="p-6 space-y-4">
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

      <div className="flex items-center justify-between">
        <TableFilterBar
          value={filterText}
          onChange={setFilterText}
          hideColumns={true}
        />
        <div className="text-sm">
          Suma (widoczne): <span className={`font-bold ${net >= 0 ? 'text-green-600' : 'text-destructive'}`}>{formatAmount(net)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center pb-2">
        <FacetedFilter
          title="Kategoria"
          options={CATEGORY_OPTIONS.filter(o => o.value !== 'all')}
          selectedValues={categories}
          onSelectedChange={setCategories}
        />

        <FacetedFilter
          title="Typ"
          options={[...TYPE_OPTIONS]}
          selectedValues={entryTypes}
          onSelectedChange={setEntryTypes}
        />

        <FacetedFilter
          title="Najemca"
          options={uniqueTenants.map(t => ({ label: t, value: t }))}
          selectedValues={selectedTenants}
          onSelectedChange={setSelectedTenants}
        />

        <div className="w-px h-5 bg-border mx-1" />

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Od</span>
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Do</span>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36 h-8 text-sm"
          />
        </div>
        {hasDates && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => { setDateFrom(''); setDateTo('') }}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Wyczyść daty
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 cursor-pointer select-none" onClick={() => handleSort('id' as any)}>
              ID<SortIcon col={'id' as any} sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('date')}>
              Data<SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')}>
              Typ<SortIcon col="type" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenant')}>
              Najemca<SortIcon col="tenant" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('description')}>
              Opis<SortIcon col="description" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('amount')}>
              Kwota<SortIcon col="amount" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Ładowanie…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : `Brak operacji dla ${year}`}
              </TableCell>
            </TableRow>
          )}
          {visible.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-muted-foreground">{entry.id}</TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {formatDate(entry.date)}
              </TableCell>
              <TableCell>
                {entry.type === 'invoice' ? (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${entry.invoiceType === 'RENT' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                    {entry.invoiceType ? (TYPE_LABELS[entry.invoiceType] ?? entry.invoiceType) : 'Obciazenie'}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {getTypeLabel(entry)}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-sm">{entry.tenantName}</TableCell>
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
