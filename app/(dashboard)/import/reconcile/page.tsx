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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Przypisywanie transakcji</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tytuł</TableHead>
            <TableHead>Konto nadawcy</TableHead>
            <TableHead className="text-right">Kwota</TableHead>
            <TableHead>Najemca</TableHead>
            <TableHead className="w-36" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
              <TableCell className="text-sm max-w-48 truncate">{tx.title}</TableCell>
              <TableCell className="font-mono text-xs">{tx.bank_account || '—'}</TableCell>
              <TableCell className="text-right text-sm font-medium">
                {formatAmount(Number(tx.amount))}
              </TableCell>
              <TableCell>
                <Select
                  value={selectedTenants[tx.id] ?? ''}
                  onValueChange={(v) =>
                    setSelectedTenants({ ...selectedTenants, [tx.id]: v ?? '' })
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Wybierz..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.first_name} {t.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
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
              </TableCell>
            </TableRow>
          ))}
          {transactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Brak niedopasowanych transakcji
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

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
