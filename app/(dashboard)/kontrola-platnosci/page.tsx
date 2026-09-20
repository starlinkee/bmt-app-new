'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { getTenantsWithBalances, sendStatementToTenant, getGlobalPaymentStats } from './actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { formatAmount, formatDateTime } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { ChevronUp, ChevronDown, ChevronsUpDown, Mail, Loader2 } from 'lucide-react'

type TenantWithBalance = Awaited<ReturnType<typeof getTenantsWithBalances>>[number]
type SortKey = 'name' | 'property' | 'account' | 'balance' | 'totalInflows'
type SortDir = 'asc' | 'desc'

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
    } else if (key === 'account') {
      va = (a.paymentAccountLabel ?? '').toLowerCase()
      vb = (b.paymentAccountLabel ?? '').toLowerCase()
    } else if (key === 'balance') {
      va = a.balance
      vb = b.balance
    } else if (key === 'totalInflows') {
      va = a.totalInflows
      vb = b.totalInflows
    }
    if (typeof va === 'string' && typeof vb === 'string') {
      const cmp = va.localeCompare(vb, 'pl')
      return dir === 'asc' ? cmp : -cmp
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesTenantFilter(t: TenantWithBalance, text: string): boolean {
  const q = text.toLowerCase()
  const name = `${t.first_name} ${t.last_name}`.toLowerCase()
  const company = (t.company_name ?? '').toLowerCase()
  const property = (t.property?.name || t.property?.address1 || '').toLowerCase()
  return name.includes(q) || company.includes(q) || property.includes(q)
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey, sortKey: SortKey, sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
  return sortDir === 'asc'
    ? <ChevronUp className="ml-1 h-3 w-3 inline" />
    : <ChevronDown className="ml-1 h-3 w-3 inline" />
}

export default function KontrolaPlatnosciPage() {
  const router = useRouter()
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.kontrolaPlatnosci,
    queryFn: getTenantsWithBalances,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const { data: stats } = useQuery({
    queryKey: QUERY_KEYS.globalPaymentStats,
    queryFn: getGlobalPaymentStats,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterText, setFilterText] = useState('')
  const [sendingTenantIds, setSendingTenantIds] = useState<Set<number>>(new Set())
  const [sendingAll, setSendingAll] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // Podczas masowej wysyłki ostrzegaj przy zamknięciu/odświeżeniu karty,
  // bo przerwałoby to pętlę w połowie listy.
  useEffect(() => {
    if (!sendingAll) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [sendingAll])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = filterText
    ? tenants.filter((t) => matchesTenantFilter(t, filterText))
    : tenants
  const sorted = sortTenants(filtered, sortKey, sortDir)

  const totalBalance = tenants.reduce((sum, t) => sum + t.balance, 0)
  const debtors = tenants.filter((t) => t.balance < 0)

  async function handleSendToAllDebtors() {
    if (debtors.length === 0) return
    if (!confirm(`Wysłać podsumowanie salda do ${debtors.length} najemców z ujemnym saldem?`)) return

    setSendingAll(true)
    setProgress({ done: 0, total: debtors.length })
    setSendingTenantIds((prev) => {
      const next = new Set(prev)
      for (const t of debtors) next.add(t.id)
      return next
    })

    let sent = 0
    let failed = 0
    for (const t of debtors) {
      try {
        const res = await sendStatementToTenant(t.id)
        if (res.success) {
          sent++
        } else {
          failed++
        }
      } catch {
        failed++
      } finally {
        setProgress((p) => ({ ...p, done: p.done + 1 }))
        setSendingTenantIds((prev) => {
          const next = new Set(prev)
          next.delete(t.id)
          return next
        })
      }
    }

    setSendingAll(false)
    if (failed === 0) {
      toast.success(`Wysłano ${sent} wiadomości.`)
    } else {
      toast.error(`Wysłano ${sent} wiadomości, ${failed} nie powiodło się.`)
    }
  }

  return (
    <div className="p-6 space-y-4">
      {sendingAll && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-live="polite"
        >
          <div className="rounded-lg border bg-card p-8 shadow-lg text-center space-y-4 max-w-sm">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <div className="text-lg font-semibold">Wysyłanie wiadomości…</div>
            <div className="text-sm text-muted-foreground">
              Wysłano {progress.done} z {progress.total}
            </div>
            <div className="h-2 w-64 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="text-sm font-medium text-destructive">
              Nie zamykaj ani nie odświeżaj strony do zakończenia.
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Kontrola płatności</h1>
          {stats?.trackingSince && (
            <p className="text-sm text-muted-foreground mt-1">
              Śledzimy płatności od: <span className="font-medium text-foreground">{new Date(stats.trackingSince).toLocaleDateString('pl-PL')}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col md:flex-row items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-6">
            {stats && (
              <div>
                Łączne przychody:{' '}
                <span className="font-semibold text-foreground">
                  {formatAmount(stats.totalInflows)}
                </span>
              </div>
            )}
            <div>
              Łączne saldo:{' '}
              <span className={`font-semibold ${totalBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {formatAmount(totalBalance)}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={sendingAll || debtors.length === 0}
            onClick={handleSendToAllDebtors}
          >
            {sendingAll ? 'Wysyłanie...' : `Wyślij do wszystkich zadłużonych (${debtors.length})`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push('/wiadomosci')}
          >
            Historia wiadomości
          </Button>
        </div>
      </div>

      <TableFilterBar
        value={filterText}
        onChange={setFilterText}
        hideColumns={true}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
              Najemca<SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('property')}>
              Nieruchomość<SortIcon col="property" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('account')}>
              Konto<SortIcon col="account" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('totalInflows')}>
              Przychody<SortIcon col="totalInflows" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('balance')}>
              Saldo<SortIcon col="balance" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead>Ostatnia kontrola</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Ładowanie…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : 'Brak najemców'}
              </TableCell>
            </TableRow>
          )}
          {sorted.map((t) => (
            <TableRow
              key={t.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/najemcy/${t.id}`)}
            >
              <TableCell className="font-medium">
                <div>{t.first_name} {t.last_name}</div>
                {t.company_name && (
                  <div className="text-xs text-muted-foreground">{t.company_name}</div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span>{t.email || '—'}</span>
                  {t.email2 && (
                    <span
                      className="inline-flex items-center justify-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground cursor-help"
                      title={t.email2}
                    >
                      +1
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.property?.name || t.property?.address1 || '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.paymentAccountLabel ?? '—'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatAmount(t.totalInflows)}
              </TableCell>
              <TableCell
                className={`text-right font-semibold ${
                  t.balance >= 0 ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {formatAmount(t.balance)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {!t.paymentAccount ? (
                  <span>Brak konta</span>
                ) : !t.lastImportAt ? (
                  <span>Brak importu</span>
                ) : (
                  <span className="text-foreground">{formatDateTime(t.lastImportAt)}</span>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={sendingTenantIds.has(t.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (sendingTenantIds.has(t.id)) return
                    if (!confirm(`Wysłać podsumowanie salda do najemcy "${t.first_name} ${t.last_name}"?`)) return
                    setSendingTenantIds((prev) => new Set(prev).add(t.id))
                    toast.promise(
                      sendStatementToTenant(t.id)
                        .then((res) => {
                          if (!res.success) {
                            throw new Error(res.error)
                          }
                          return res
                        })
                        .finally(() => {
                          setSendingTenantIds((prev) => {
                            const next = new Set(prev)
                            next.delete(t.id)
                            return next
                          })
                        }),
                      {
                        loading: 'Wysyłanie wyciągu...',
                        success: 'Wysłano pomyślnie!',
                        error: (err) => err.message || 'Błąd wysyłania'
                      }
                    )
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
