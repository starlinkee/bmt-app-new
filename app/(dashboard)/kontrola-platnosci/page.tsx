'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { getTenantsWithBalances, getGlobalPaymentStats, sendStatementToTenant } from './actions'
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
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { ChevronUp, ChevronDown, ChevronsUpDown, Mail } from 'lucide-react'

type TenantWithBalance = Awaited<ReturnType<typeof getTenantsWithBalances>>[number]
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
  const router = useRouter()
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.kontrolaPlatnosci,
    queryFn: getTenantsWithBalances,
  })

  const { data: stats } = useQuery({
    queryKey: ['globalPaymentStats'],
    queryFn: getGlobalPaymentStats,
  })

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

  const totalBalance = tenants.reduce((sum, t) => sum + t.balance, 0)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kontrola płatności</h1>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex flex-col items-end">
            <div>
              Łączne saldo:{' '}
              <span className={`font-semibold ${totalBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {formatAmount(totalBalance)}
              </span>
            </div>
            {stats && (
              <div className="text-xs mt-1">
                Całkowity zarobek: <span className="font-semibold text-foreground">{formatAmount(stats.totalEarnings)}</span>
              </div>
            )}
            {stats?.trackingSince && (
              <div className="text-xs">
                Śledzimy od: <span className="font-semibold text-foreground">{formatDate(stats.trackingSince)}</span>
              </div>
            )}
          </div>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => router.push('/wiadomosci')}
          >
            Dziennik wiadomości
          </Button>
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
            <TableHead className="w-16"></TableHead>
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
              onClick={() => router.push(`/kontrola-platnosci/${t.id}`)}
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
              <TableCell>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={(e) => {
                    e.stopPropagation()
                    toast.promise(sendStatementToTenant(t.id), {
                      loading: 'Wysyłanie wyciągu...',
                      success: 'Wysłano pomyślnie!',
                      error: (err) => err.message || 'Błąd wysyłania'
                    })
                  }}
                  title="Wyślij podsumowanie do tego najemcy"
                >
                  <Mail className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
