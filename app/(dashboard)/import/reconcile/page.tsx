'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  getUnmatchedTransactions,
  reconcileTransaction,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatAmount, formatDate } from '@/lib/utils'

type Transaction = Awaited<ReturnType<typeof getUnmatchedTransactions>>[number]
type Tenant = Awaited<ReturnType<typeof getTenants>>[number]

export default function ReconcilePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenants, setSelectedTenants] = useState<Record<number, string>>({})
  const [confirmTx, setConfirmTx] = useState<Transaction | null>(null)
  const [saveAccount, setSaveAccount] = useState(true)
  const [pending, startTransition] = useTransition()

  function load() {
    startTransition(async () => {
      const [txs, ts] = await Promise.all([
        getUnmatchedTransactions(),
        getTenants(),
      ])
      setTransactions(txs)
      setTenants(ts)
    })
  }

  useEffect(() => { load() }, [])

  function handleAssignClick(tx: Transaction) {
    if (!selectedTenants[tx.id]) {
      toast.error('Wybierz najemcę.')
      return
    }
    if (tx.bank_account) {
      setConfirmTx(tx)
      setSaveAccount(true)
    } else {
      doAssign(tx, false)
    }
  }

  function doAssign(tx: Transaction, save: boolean) {
    const tenantId = Number(selectedTenants[tx.id])
    startTransition(async () => {
      await reconcileTransaction(tx.id, tenantId, save)
      toast.success('Transakcja przypisana.')
      setConfirmTx(null)
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

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Przypisywanie transakcji</h1>
        <span className="text-sm text-muted-foreground">{transactions.length} niedopasowanych</span>
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
              {/* Kwota i data — nagłówek karty */}
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-green-600">
                  {formatAmount(Number(tx.amount))}
                </span>
                <span className="text-sm text-muted-foreground">{formatDate(tx.date)}</span>
              </div>

              {/* Wszystkie pola z CSV */}
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

              {/* Przypisanie */}
              <div className="flex gap-2 pt-1 border-t">
                <Select
                  value={selectedTenants[tx.id] ?? ''}
                  onValueChange={(v) =>
                    setSelectedTenants({ ...selectedTenants, [tx.id]: v ?? '' })
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
                  onClick={() => handleAssignClick(tx)}
                  disabled={pending}
                >
                  Przypisz
                </Button>
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

      <Dialog open={!!confirmTx} onOpenChange={() => setConfirmTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zapamiętać numer konta?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Konto: <span className="font-mono">{confirmTx?.bank_account}</span>
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={saveAccount}
                onChange={(e) => setSaveAccount(e.target.checked)}
              />
              Zapisz konto do profilu najemcy
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTx(null)}>
              Anuluj
            </Button>
            <Button
              onClick={() => confirmTx && doAssign(confirmTx, saveAccount)}
              disabled={pending}
            >
              Przypisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
