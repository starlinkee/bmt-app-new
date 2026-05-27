'use client'

import { useState, useTransition } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTenantsWithBalances, getTenantStatement } from './actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type TenantWithBalance = Awaited<ReturnType<typeof getTenantsWithBalances>>[number]
type StatementEntry = Awaited<ReturnType<typeof getTenantStatement>>[number]
type SortKey = 'name' | 'property' | 'balance'
type SortDir = 'asc' | 'desc'

const FILTER_COLUMNS = [
  { key: 'name', label: 'Najemca' },
  { key: 'property', label: 'Nieruchomość' },
]

function sortTenants(tenants: TenantWithBalance[], key: SortKey, dir: SortDir): TenantWithBalance[] {
  return [...tenants].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'name') {
      va = `${a.last_name} ${a.first_name}`.toLowerCase()
      vb = `${b.last_name} ${b.first_name}`.toLowerCase()
    } else if (key === 'property') {
      va = (a.property?.name || a.property?.address1 || '').toLowerCase()
      vb = (b.property?.name || b.property?.address1 || '').toLowerCase()
    } else if (key === 'balance') {
      va = a.balance
      vb = b.balance
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesTenantFilter(t: TenantWithBalance, text: string, col: string): boolean {
  const q = text.toLowerCase()
  const name = `${t.first_name} ${t.last_name}`.toLowerCase()
  const company = (t.company_name ?? '').toLowerCase()
  const property = (t.property?.name || t.property?.address1 || '').toLowerCase()
  if (col === '__all__') return name.includes(q) || company.includes(q) || property.includes(q)
  if (col === 'name') return name.includes(q) || company.includes(q)
  if (col === 'property') return property.includes(q)
  return false
}

export default function KontrolaPlatnosciPage() {
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.kontrolaPlatnosci,
    queryFn: getTenantsWithBalances,
  })

  const [selected, setSelected] = useState<TenantWithBalance | null>(null)
  const [statement, setStatement] = useState<StatementEntry[]>([])
  const [loadingStatement, startTransition] = useTransition()
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
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

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />
  }

  const filtered = filterText
    ? tenants.filter((t) => matchesTenantFilter(t, filterText, filterCol))
    : tenants
  const sorted = sortTenants(filtered, sortKey, sortDir)

  function openTenant(tenant: TenantWithBalance) {
    setSelected(tenant)
    setStatement([])
    startTransition(async () => {
      const data = await getTenantStatement(tenant.id)
      setStatement(data.slice().reverse())
    })
  }

  const totalBalance = tenants.reduce((sum, t) => sum + t.balance, 0)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kontrola płatności</h1>
        <div className="text-sm text-muted-foreground">
          Łączne saldo:{' '}
          <span className="font-semibold">
            {formatAmount(totalBalance)}
          </span>
        </div>
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
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
              Najemca<SortIcon col="name" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('property')}>
              Nieruchomość<SortIcon col="property" />
            </TableHead>
            <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('balance')}>
              Saldo<SortIcon col="balance" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                Ładowanie…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : 'Brak najemców'}
              </TableCell>
            </TableRow>
          )}
          {sorted.map((t) => (
            <TableRow
              key={t.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => openTenant(t)}
            >
              <TableCell className="font-medium">
                <div>{t.first_name} {t.last_name}</div>
                {t.company_name && (
                  <div className="text-xs text-muted-foreground">{t.company_name}</div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.property?.name || t.property?.address1 || '—'}
              </TableCell>
              <TableCell
                className={`text-right font-semibold ${
                  t.balance >= 0 ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {formatAmount(t.balance)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selected?.first_name} {selected?.last_name}
              {selected && (
                <span
                  className={`text-base font-bold ${
                    selected.balance >= 0 ? 'text-green-600' : 'text-destructive'
                  }`}
                >
                  {formatAmount(selected.balance)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Opis</TableHead>
                  <TableHead className="text-right">Kwota</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingStatement && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Ładowanie…
                    </TableCell>
                  </TableRow>
                )}
                {!loadingStatement && statement.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Brak operacji
                    </TableCell>
                  </TableRow>
                )}
                {statement.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(entry.date)}
                    </TableCell>
                    <TableCell className="text-sm">{entry.description}</TableCell>
                    <TableCell
                      className={`text-right text-sm font-medium ${
                        entry.amount >= 0 ? 'text-green-600' : 'text-destructive'
                      }`}
                    >
                      {formatAmount(entry.amount)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatAmount(entry.runningBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
