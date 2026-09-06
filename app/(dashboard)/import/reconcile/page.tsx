'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  getUnmatchedTransactions,
  reconcileMany,
  dismissTransaction,
} from '../actions'
import { getTenants } from '@/app/(dashboard)/najemcy/actions'
import { Button } from '@/components/ui/button'
import { SearchSelect } from '@/components/ui/search-select'
import { formatAmount, formatDate } from '@/lib/utils'
import { AlertTriangle, X } from 'lucide-react'

type Transaction = Awaited<ReturnType<typeof getUnmatchedTransactions>>[number]
type Tenant = Awaited<ReturnType<typeof getTenants>>[number]
type Category = 'RENT' | 'MEDIA'

export default function ReconcilePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenants, setSelectedTenants] = useState<Record<number, string>>({})
  const [selectedCategories, setSelectedCategories] = useState<Record<number, Category>>({})
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function load() {
    startTransition(async () => {
      const [txs, ts] = await Promise.all([
        getUnmatchedTransactions(),
        getTenants(),
      ])
      setTransactions(txs)
      setTenants(ts)
      setBannerDismissed(false)
      const suggestions: Record<number, string> = {}
      for (const tx of txs) {
        if (tx.suggested_tenant_id != null) {
          suggestions[tx.id] = String(tx.suggested_tenant_id)
        }
      }
      setSelectedTenants(suggestions)
      setSelectedCategories({})
    })
  }

  useEffect(() => { load() }, [])

  const readyCount = transactions.filter(
    (tx) => selectedTenants[tx.id] && selectedCategories[tx.id],
  ).length
  const duplicateCount = transactions.filter((tx) => tx.is_duplicate).length

  function handleBulkConfirm() {
    const items = transactions
      .filter((tx) => selectedTenants[tx.id] && selectedCategories[tx.id])
      .map((tx) => ({
        txId: tx.id,
        tenantId: Number(selectedTenants[tx.id]),
        category: selectedCategories[tx.id],
      }))

    if (items.length === 0) return

    startTransition(async () => {
      await reconcileMany(items)
      toast.success(`Przypisano ${items.length} transakcji.`)
      
      if (items.length === transactions.length) {
        router.push('/kontrola-platnosci')
      } else {
        load()
      }
    })
  }

  function handleDismiss(txId: number) {
    startTransition(async () => {
      await dismissTransaction(txId)
      toast.success('Transakcja odrzucona.')
      load()
    })
  }

  const confirmButton = (
    <Button
      onClick={handleBulkConfirm}
      disabled={readyCount === 0 || pending}
    >
      Zatwierdź wybrane{readyCount > 0 ? ` (${readyCount})` : ''}
    </Button>
  )

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      {duplicateCount > 0 && !bannerDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">
            <strong>{duplicateCount}</strong> {duplicateCount === 1 ? 'transakcja' : duplicateCount < 5 ? 'transakcje' : 'transakcji'} poniżej {duplicateCount === 1 ? 'jest oznaczona' : 'są oznaczone'} jako możliwy duplikat — taka sama data, kwota i numer konta już istnieje w bazie. Sprawdź zanim zatwierdzisz.
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Przypisywanie transakcji</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{transactions.length} niedopasowanych</span>
          {confirmButton}
        </div>
      </div>

      {transactions.length === 0 && (
        <p className="text-center text-muted-foreground py-16">Brak niedopasowanych transakcji</p>
      )}

      <div className="space-y-3">
        {transactions.map((tx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawData = ((tx as any).raw_data ?? {}) as Record<string, string>
          const rawEntries = Object.entries(rawData).filter(([, v]) => v)
          const category = selectedCategories[tx.id]

          return (
            <div
              key={tx.id}
              className={`rounded-lg border bg-card p-4 space-y-3 ${tx.is_duplicate ? 'border-red-300 dark:border-red-800' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-green-600">
                    {formatAmount(Number(tx.amount))}
                  </span>
                  {tx.is_duplicate && (
                    <span className="relative group">
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 cursor-help">
                        <AlertTriangle className="h-3 w-3" />
                        Duplikat
                      </span>
                      <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 hidden group-hover:block whitespace-nowrap rounded bg-popover text-popover-foreground text-xs px-2 py-1 shadow-md border border-border z-10">
                        Transakcja o tej samej dacie, kwocie i numerze konta już istnieje w bazie
                      </span>
                    </span>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">{formatDate(tx.date)}</span>
              </div>

              {rawEntries.length > 0 ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {rawEntries.map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-muted-foreground whitespace-nowrap">{key}</dt>
                      <dd className="font-mono text-xs break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Tytuł:</span> {tx.title || '—'}</p>
                  <p><span className="text-muted-foreground">Konto:</span> <span className="font-mono text-xs">{tx.bank_account || '—'}</span></p>
                </div>
              )}

              <div className="flex gap-2 pt-1 border-t">
                <div className="flex-1 space-y-2">
                  {tx.suggested_tenant_id != null && selectedTenants[tx.id] === String(tx.suggested_tenant_id) && (
                    <p className="text-xs text-muted-foreground">Sugestia wg kwoty i historii — wymaga potwierdzenia</p>
                  )}
                  <SearchSelect
                    options={tenants.map((t) => ({
                      value: String(t.id),
                      label: `${t.first_name} ${t.last_name}`,
                      description: (t.properties as unknown as { name: string } | null)?.name,
                    }))}
                    value={selectedTenants[tx.id] ?? ''}
                    onValueChange={(v) =>
                      setSelectedTenants((prev) => ({ ...prev, [tx.id]: v }))
                    }
                    placeholder="Wyszukaj najemcę..."
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground mr-1">Rodzaj:</span>
                    <button
                      onClick={() =>
                        setSelectedCategories((prev) => ({ ...prev, [tx.id]: 'RENT' }))
                      }
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        category === 'RENT'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      Czynsz
                    </button>
                    <button
                      onClick={() =>
                        setSelectedCategories((prev) => ({ ...prev, [tx.id]: 'MEDIA' }))
                      }
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        category === 'MEDIA'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      Media
                    </button>
                    {!category && (
                      <span className="text-xs text-muted-foreground ml-1 italic">wymagane</span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDismiss(tx.id)}
                  disabled={pending}
                >
                  Odrzuć
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {transactions.length > 0 && (
        <div className="flex justify-end pt-2">
          {confirmButton}
        </div>
      )}
    </div>
  )
}
