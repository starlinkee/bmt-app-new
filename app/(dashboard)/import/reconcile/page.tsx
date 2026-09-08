'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  getUnmatchedTransactions,
  reconcileMany,
  dismissTransaction,
  dismissAllTransactions,
} from '../actions'
import { getTenants } from '@/app/(dashboard)/najemcy/actions'
import { Button } from '@/components/ui/button'
import { SearchSelect } from '@/components/ui/search-select'
import { formatAmount, formatDate } from '@/lib/utils'
import { AlertTriangle, X, Check } from 'lucide-react'

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
      const catSuggestions: Record<number, Category> = {}

      for (const tx of txs) {
        if (tx.suggested_tenant_id != null) {
          suggestions[tx.id] = String(tx.suggested_tenant_id)
          if (tx.suggested_tenant_id !== -1) {
            const tenant = ts.find((t) => t.id === tx.suggested_tenant_id)
            if (tenant && Array.isArray(tenant.contracts)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const activeContract = tenant.contracts.find((c: any) => c.is_active)
              if (activeContract && activeContract.rent_amount != null) {
                if (Number(tx.amount) === Number(activeContract.rent_amount)) {
                  catSuggestions[tx.id] = 'RENT'
                } else {
                  catSuggestions[tx.id] = 'MEDIA'
                }
              }
            }
          }
        }
      }
      setSelectedTenants(suggestions)
      setSelectedCategories(catSuggestions)
    })
  }

  useEffect(() => { load() }, [])

  const readyCount = transactions.filter(
    (tx) => selectedTenants[tx.id] && (selectedCategories[tx.id] || selectedTenants[tx.id] === '-1'),
  ).length
  const duplicateCount = transactions.filter((tx) => tx.is_duplicate).length

  function handleBulkConfirm() {
    const selectedTxs = transactions.filter(
      (tx) => selectedTenants[tx.id] && (selectedCategories[tx.id] || selectedTenants[tx.id] === '-1')
    )
    if (selectedTxs.length === 0) return

    const toReconcile = selectedTxs
      .filter((tx) => selectedTenants[tx.id] !== '-1')
      .map((tx) => ({
        txId: tx.id,
        tenantId: Number(selectedTenants[tx.id]),
        category: selectedCategories[tx.id],
      }))
    
    const toDismiss = selectedTxs
      .filter((tx) => selectedTenants[tx.id] === '-1')
      .map((tx) => tx.id)

    startTransition(async () => {
      if (toReconcile.length > 0) {
        await reconcileMany(toReconcile)
      }
      for (const txId of toDismiss) {
        await dismissTransaction(txId, 'REJECTED_OWN_TRANSFER')
      }
      toast.success(`Przetworzono ${selectedTxs.length} transakcji.`)
      
      if (selectedTxs.length === transactions.length) {
        router.push('/kontrola-platnosci')
      } else {
        load()
      }
    })
  }

  function handleDismiss(txId: number) {
    startTransition(async () => {
      await dismissTransaction(txId, 'REJECTED_OTHER')
      toast.success('Transakcja odrzucona.')
      load()
    })
  }

  function handleDismissAll() {
    if (!window.confirm('Czy na pewno chcesz odrzucić wszystkie niezatwierdzone transakcje i anulować ten import?')) return
    startTransition(async () => {
      await dismissAllTransactions()
      toast.success('Anulowano import. Niezatwierdzone transakcje zostały usunięte.')
      router.push('/import')
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

  const dismissAllButton = transactions.length > 0 ? (
    <Button
      variant="outline"
      onClick={handleDismissAll}
      disabled={pending}
    >
      Odrzuć wszystkie (anuluj)
    </Button>
  ) : null

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
          {dismissAllButton}
          {confirmButton}
        </div>
      </div>

      {transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <p className="text-muted-foreground">Brak niedopasowanych transakcji</p>
          <Button onClick={() => router.push('/import')}>Wgraj nowy plik CSV</Button>
        </div>
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
                  {tx.suggested_tenant_id != null && tx.suggested_tenant_id !== -1 && selectedTenants[tx.id] === String(tx.suggested_tenant_id) && (
                    <p className="text-xs text-muted-foreground">Sugestia wg kwoty i historii — wymaga potwierdzenia</p>
                  )}
                  {tx.suggested_tenant_id === -1 && selectedTenants[tx.id] === '-1' && (
                    <p className="text-xs text-muted-foreground">Przelew własny rozpoznany po rachunku źródłowym</p>
                  )}
                  <SearchSelect
                    options={[
                      { value: '-1', label: '❌ Odrzuć (przelew własny / ignoruj)' },
                      ...tenants.map((t) => ({
                      value: String(t.id),
                      label: `${t.first_name} ${t.last_name}`,
                      description: (t.properties as unknown as { name: string } | null)?.name,
                    }))]}
                    value={selectedTenants[tx.id] ?? ''}
                    onValueChange={(v) => {
                      setSelectedTenants((prev) => ({ ...prev, [tx.id]: v }))
                      if (v !== '-1' && v !== '') {
                        const tenant = tenants.find((t) => String(t.id) === v)
                        if (tenant && Array.isArray(tenant.contracts)) {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const activeContract = tenant.contracts.find((c: any) => c.is_active)
                          if (activeContract && activeContract.rent_amount != null) {
                            setSelectedCategories((prev) => ({
                              ...prev,
                              [tx.id]: Number(tx.amount) === Number(activeContract.rent_amount) ? 'RENT' : 'MEDIA'
                            }))
                          }
                        }
                      } else {
                        setSelectedCategories((prev) => {
                          const next = { ...prev }
                          delete next[tx.id]
                          return next
                        })
                      }
                    }}
                    placeholder="Wyszukaj najemcę..."
                  />
                  {selectedTenants[tx.id] !== '-1' && (
                  <div className="flex items-center gap-2 mt-1.5 p-1.5 bg-muted/40 rounded-md border">
                    <span className="text-xs font-semibold text-muted-foreground min-w-[50px] pl-1">Rodzaj:</span>
                    <button
                      onClick={() =>
                        setSelectedCategories((prev) => ({ ...prev, [tx.id]: 'RENT' }))
                      }
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 ${
                        category === 'RENT'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-1 ring-blue-600 ring-offset-1 ring-offset-background'
                          : 'bg-background text-muted-foreground border-border hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {category === 'RENT' && <Check className="w-3.5 h-3.5" />}
                      CZYNSZ
                    </button>
                    <button
                      onClick={() =>
                        setSelectedCategories((prev) => ({ ...prev, [tx.id]: 'MEDIA' }))
                      }
                      className={`flex-1 px-3 py-1.5 rounded text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 ${
                        category === 'MEDIA'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-1 ring-emerald-600 ring-offset-1 ring-offset-background'
                          : 'bg-background text-muted-foreground border-border hover:border-emerald-300 hover:text-emerald-600'
                      }`}
                    >
                      {category === 'MEDIA' && <Check className="w-3.5 h-3.5" />}
                      MEDIA
                    </button>
                    {!category && (
                      <span className="text-xs font-bold text-red-500 ml-1 uppercase animate-pulse">Wybierz!</span>
                    )}
                  </div>
                  )}
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
        <div className="flex justify-end gap-3 pt-2">
          {dismissAllButton}
          {confirmButton}
        </div>
      )}
    </div>
  )
}
