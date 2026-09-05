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
import { FacetedFilter } from '@/components/ui/faceted-filter'
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

const TENANT_TYPE_OPTIONS = [
  { value: 'all', label: 'Wszyscy' },
  { value: 'PRIVATE', label: 'Prywatni' },
  { value: 'BUSINESS', label: 'Firmy' },
] as const

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

  const [tenantTypes, setTenantTypes] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<Set<string>>(new Set())
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set())

  const categoryFiltered = entries.filter((e) => {
    if (categories.size === 0) return true
    const cat = e.type === 'transaction' ? 'transaction' : (e.invoiceType ?? 'OTHER')
    return categories.has(cat)
  })
  
  const tenantFiltered = categoryFiltered.filter((e) => {
    if (tenantTypes.size === 0) return true
    return e.tenantType && tenantTypes.has(e.tenantType)
  })

  const selectedTenantsFiltered = tenantFiltered.filter((e) => {
    if (selectedTenants.size === 0) return true
    return e.tenantName && selectedTenants.has(e.tenantName)
  })

  const textFiltered = filterText
    ? selectedTenantsFiltered.filter((e) => matchesEntryFilter(e, filterText))
    : selectedTenantsFiltered
    
  const visible = sortEntries(textFiltered, sortKey, sortDir)

  const totalIn = selectedTenantsFiltered.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const totalOut = selectedTenantsFiltered.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
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
          title="Typ najemcy"
          options={TENANT_TYPE_OPTIONS.filter(o => o.value !== 'all')}
          selectedValues={tenantTypes}
          onSelectedChange={setTenantTypes}
        />
        <FacetedFilter
          title="Najemca"
          options={uniqueTenants.map(t => ({ label: t, value: t }))}
          selectedValues={selectedTenants}
          onSelectedChange={setSelectedTenants}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('date')}>
              Data<SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')}>
              Typ<SortIcon col="type" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenant')}>
              Najemca<SortIcon col="tenant" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenantType')}>
              Typ najemcy<SortIcon col="tenantType" sortKey={sortKey} sortDir={sortDir} />
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
