'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { getTenant } from '../actions'
import { getTenantStatement, getTenantBalance } from './actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { formatAmount, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronUp, ChevronDown, ChevronsUpDown, Printer, X } from 'lucide-react'
import { AddAdjustmentButton } from './add-adjustment-button'
import { EditTransactionButton } from './edit-transaction-button'
import type { StatementEntry } from '@/types/app'

type SortKey = 'date' | 'description' | 'amount'
type SortDir = 'asc' | 'desc'
type EntryTypeFilter = 'all' | 'transaction' | 'invoice'
type CategoryFilter = 'all' | 'RENT' | 'MEDIA'

const TX_STATUS_LABEL: Record<string, string> = {
  MATCHED: 'Auto',
  MANUAL: 'Ręczna',
}

const CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Czynsz',
  MEDIA: 'Media',
  OTHER: 'Inne',
}

function entryKind(entry: StatementEntry): string {
  if (entry.type === 'invoice') {
    return CATEGORY_LABELS[entry.invoiceType ?? ''] ?? 'Obciążenie'
  }
  if (entry.transactionCategory) {
    return `Wpłata (${CATEGORY_LABELS[entry.transactionCategory] ?? entry.transactionCategory})`
  }
  return 'Wpłata (bez kategorii)'
}

function matchesFilters(
  entry: StatementEntry,
  entryType: EntryTypeFilter,
  category: CategoryFilter,
): boolean {
  if (entryType === 'transaction' && entry.type !== 'transaction') return false
  if (entryType === 'invoice' && entry.type !== 'invoice') return false
  if (category === 'RENT') {
    if (entry.type === 'invoice') return entry.invoiceType === 'RENT'
    return entry.transactionCategory === 'RENT'
  }
  if (category === 'MEDIA') {
    if (entry.type === 'invoice') return entry.invoiceType === 'MEDIA'
    return entry.transactionCategory === 'MEDIA'
  }
  return true
}

function matchesDateRange(entry: StatementEntry, from: string, to: string): boolean {
  const d = entry.date ?? ''
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

function matchesTextFilter(entry: StatementEntry, text: string): boolean {
  const q = text.toLowerCase()
  const description = (entry.description ?? '').toLowerCase()
  return description.includes(q)
}

function sortStatement(entries: StatementEntry[], key: SortKey, dir: SortDir): StatementEntry[] {
  return [...entries].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'date') {
      va = a.date ?? ''
      vb = b.date ?? ''
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

function fmtDatePL(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey, sortKey: SortKey, sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
  return sortDir === 'asc'
    ? <ChevronUp className="ml-1 h-3 w-3 inline" />
    : <ChevronDown className="ml-1 h-3 w-3 inline" />
}

export default function TenantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tenantId = Number(params.id)

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterText, setFilterText] = useState('')
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useQuery({
    queryKey: QUERY_KEYS.tenantDetail(tenantId),
    queryFn: () => getTenant(tenantId),
    enabled: Number.isFinite(tenantId),
  })

  const { data: balance = 0 } = useQuery({
    queryKey: QUERY_KEYS.tenantBalance(tenantId),
    queryFn: () => getTenantBalance(tenantId),
    enabled: Number.isFinite(tenantId),
  })

  const { data: statement = [], isLoading: statementLoading } = useQuery({
    queryKey: QUERY_KEYS.tenantStatement(tenantId),
    queryFn: () => getTenantStatement(tenantId),
    enabled: Number.isFinite(tenantId),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (tenantError) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/najemcy')}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Powrót
        </Button>
        <p className="text-muted-foreground mt-4">Nie znaleziono najemcy.</p>
      </div>
    )
  }

  const property = tenant?.properties as unknown as { name: string; address1: string } | null
  const activeContract = (tenant?.contracts as unknown as { is_active: boolean; rent_amount: number }[])
    ?.find((c) => c.is_active)

  let totalBilled = 0
  let totalPaid = 0
  let lastPayment: { date: string, amount: number } | null = null

  for (const e of statement) {
    if (e.type === 'invoice') {
      totalBilled += Math.abs(e.amount)
    } else if (e.type === 'transaction' && e.amount > 0) {
      totalPaid += e.amount
      if (!lastPayment || e.date > lastPayment.date) lastPayment = { date: e.date, amount: e.amount }
    }
  }

  const filtered = statement
    .filter((e) => matchesFilters(e, entryTypeFilter, categoryFilter))
    .filter((e) => matchesDateRange(e, dateFrom, dateTo))
    .filter((e) => !filterText || matchesTextFilter(e, filterText))
  const sorted = sortStatement(filtered, sortKey, sortDir)

  const hasDates = !!(dateFrom || dateTo)
  const isFiltered = entryTypeFilter !== 'all' || categoryFilter !== 'all' || hasDates || !!filterText
  const dateRangeLabel = hasDates
    ? `${dateFrom ? fmtDatePL(dateFrom) : '…'} – ${dateTo ? fmtDatePL(dateTo) : '…'}`
    : null
  const filterParts = [
    entryTypeFilter === 'transaction' ? 'Wpłaty' : entryTypeFilter === 'invoice' ? 'Obciążenia' : null,
    categoryFilter === 'RENT' ? 'Czynsz' : categoryFilter === 'MEDIA' ? 'Media' : null,
    dateRangeLabel,
    filterText ? `szukaj: „${filterText}"` : null,
  ].filter(Boolean)
  const filterLabel = filterParts.length ? filterParts.join(' · ') : 'Wszystkie'
  const printDate = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <>
      <style>{`
        .print-only { display: none; }
        #print-running-header { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block; }
          body * { visibility: hidden; }
          #print-running-header,
          #print-running-header *,
          #print-section,
          #print-section * { visibility: visible; }
          #print-running-header {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            padding: 10px 32px 8px;
            border-bottom: 2px solid #000;
            font-family: sans-serif;
            background: #fff;
            z-index: 9999;
          }
          #print-running-header .rh-name {
            font-size: 13pt;
            font-weight: 700;
            margin: 0;
          }
          #print-running-header .rh-range {
            font-size: 10pt;
            color: #333;
            margin: 1px 0 0;
          }
          #print-running-header .rh-date {
            position: absolute;
            top: 10px;
            right: 32px;
            font-size: 9pt;
            color: #666;
          }
          #print-section {
            position: absolute;
            inset: 0;
            padding: 100px 32px 24px;
            font-family: sans-serif;
          }
          #print-section table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11pt;
          }
          #print-section th {
            border-bottom: 2px solid #000;
            padding: 6px 8px;
            text-align: left;
            font-weight: 600;
          }
          #print-section td {
            border-bottom: 1px solid #ccc;
            padding: 5px 8px;
          }
          #print-section .text-right { text-align: right; }
          #print-section .print-summary {
            display: block;
            margin-top: 14px;
            font-size: 11pt;
            text-align: right;
          }
        }
      `}</style>

      {/* Nagłówek widoczny na każdej stronie wydruku */}
      <div id="print-running-header">
        <p className="rh-name">{tenant ? `${tenant.first_name} ${tenant.last_name}` : ''}</p>
        <p className="rh-range">
          {hasDates
            ? `Zakres dat: ${dateFrom ? fmtDatePL(dateFrom) : '…'} – ${dateTo ? fmtDatePL(dateTo) : '…'}`
            : 'Cała historia'}
          {filterLabel !== 'Wszystkie' && !hasDates ? ` · ${filterLabel}` : ''}
        </p>
        <span className="rh-date">Wygenerowano: {printDate}</span>
      </div>

      <div className="p-6 space-y-6">
        <div className="no-print">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Powrót
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              {tenant ? `${tenant.first_name} ${tenant.last_name}` : '…'}
            </h1>
            <div className="flex gap-2 mt-1">
              {tenant && <Badge variant="outline" className="font-mono">ID: {tenant.id}</Badge>}
              {property && (
                <Badge variant="outline">{property.name || property.address1}</Badge>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />
            Drukuj PDF
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6 no-print">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">Saldo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {formatAmount(balance)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">Aktywna umowa</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {activeContract ? formatAmount(activeContract.rent_amount) : '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">Suma naliczeń</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">
                {formatAmount(totalBilled)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">Suma wpłat</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {formatAmount(totalPaid)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">Ostatnia wpłata</CardTitle>
            </CardHeader>
            <CardContent>
              {lastPayment ? (
                <>
                  <p className="text-2xl font-bold text-green-600">{formatAmount(lastPayment.amount)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(lastPayment.date)}</p>
                </>
              ) : (
                <p className="text-2xl font-bold">—</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">Operacje</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{statement.length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between no-print">
          <h2 className="text-lg font-semibold">Wyciąg</h2>
          {tenant && <AddAdjustmentButton tenantId={tenantId} />}
        </div>

        <div className="flex flex-wrap items-center gap-4 no-print">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Rodzaj:</span>
            <Button
              variant={entryTypeFilter === 'transaction' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEntryTypeFilter((v) => v === 'transaction' ? 'all' : 'transaction')}
            >
              Wpłaty
            </Button>
            <Button
              variant={entryTypeFilter === 'invoice' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEntryTypeFilter((v) => v === 'invoice' ? 'all' : 'invoice')}
            >
              Obciążenia
            </Button>
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Kategoria:</span>
            <Button
              variant={categoryFilter === 'RENT' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter((v) => v === 'RENT' ? 'all' : 'RENT')}
            >
              Czynsz
            </Button>
            <Button
              variant={categoryFilter === 'MEDIA' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter((v) => v === 'MEDIA' ? 'all' : 'MEDIA')}
            >
              Media
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 no-print">
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
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="h-8 px-2 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Wyczyść daty
            </Button>
          )}
        </div>

        <div className="no-print">
          <TableFilterBar
            value={filterText}
            onChange={setFilterText}
            hideColumns={true}
          />
        </div>

        <div id="print-section">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 no-print">ID</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('date')}>
                  Data<SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead>Rodzaj</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('description')}>
                  Opis<SortIcon col="description" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => handleSort('amount')}
                >
                  Kwota<SortIcon col="amount" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="no-print">Pochodzenie</TableHead>
                <TableHead className="w-16 no-print"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tenantLoading || statementLoading) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              )}
              {!tenantLoading && !statementLoading && sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {isFiltered ? 'Brak wyników dla podanego filtra' : 'Brak operacji'}
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs text-muted-foreground font-mono no-print">{entry.id}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {entryKind(entry)}
                  </TableCell>
                  <TableCell className="text-sm">{entry.description}</TableCell>
                  <TableCell
                    className={`text-right text-sm font-medium ${
                      entry.amount >= 0 ? 'text-green-600' : 'text-destructive'
                    }`}
                  >
                    {formatAmount(entry.amount)}
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatAmount(entry.runningBalance)}</TableCell>
                  <TableCell className="no-print">
                    {entry.type === 'transaction' && entry.txStatus && TX_STATUS_LABEL[entry.txStatus] && (
                      <Badge variant="outline" className="text-xs">
                        {TX_STATUS_LABEL[entry.txStatus]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="no-print">
                    {entry.type === 'transaction' && entry.rawTxId != null && (
                      <EditTransactionButton
                        txId={entry.rawTxId}
                        tenantId={tenantId}
                        currentAmount={entry.amount}
                        currentTitle={entry.description}
                        currentDate={entry.date}
                        hasAmendments={entry.hasAmendments ?? false}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {sorted.length > 0 && (
            <div className="print-only print-summary">
              Pozycji: {sorted.length} &nbsp;·&nbsp; Saldo końcowe:{' '}
              {formatAmount(balance)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
