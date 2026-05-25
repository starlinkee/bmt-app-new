'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  getUnmatchedTransactions,
  reconcileMany,
  dismissTransaction,
} from '../actions'
import { getTenants } from '@/app/(dashboard)/tenants/actions'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatAmount, formatDate } from '@/lib/utils'

type Transaction = Awaited<ReturnType<typeof getUnmatchedTransactions>>[number]
type Tenant = Awaited<ReturnType<typeof getTenants>>[number]

export default function ReconcilePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenants, setSelectedTenants] = useState<Record<number, string>>({})
  const [pending, startTransition] = useTransition()

  function load() {
    startTransition(async () => {
      const [txs, ts] = await Promise.all([
        getUnmatchedTransactions(),
        getTenants(),
      ])
      setTransactions(txs)
      setTenants(ts)
      setSelectedTenants({})
    })
  }

  useEffect(() => { load() }, [])

  const selectedCount = Object.values(selectedTenants).filter(Boolean).length

  function handleBulkConfirm() {
    const items = transactions
      .filter((tx) => selectedTenants[tx.id])
      .map((tx) => ({ txId: tx.id, tenantId: Number(selectedTenants[tx.id]) }))

    if (items.length === 0) return

    startTransition(async () => {
      await reconcileMany(items)
      toast.success(`Przypisano ${items.length} transakcji.`)
      load()
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
      disabled={selectedCount === 0 || pending}
    >
      Zatwierdź wybrane{selectedCount > 0 ? ` (${selectedCount})` : ''}
    </Button>
  )

  return (
    <div className="p-6 space-y-4 max-w-4xl">
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

          return (
            <div key={tx.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-green-600">
                  {formatAmount(Number(tx.amount))}
                </span>
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
                <Select
                  value={selectedTenants[tx.id] ?? ''}
                  onValueChange={(v) =>
                    setSelectedTenants((prev) => ({ ...prev, [tx.id]: v ?? '' }))
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Wybierz najemcę..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.first_name} {t.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
