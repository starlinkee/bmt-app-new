'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateTransaction, getTransactionAmendments } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatAmount, formatDateTime } from '@/lib/utils'
import { Pencil, History } from 'lucide-react'

type Amendment = {
  id: number
  before_data: { amount: number; title: string; date: string }
  after_data: { amount: number; title: string; date: string }
  amended_at: string
  note: string | null
}

export function EditTransactionButton({
  txId,
  tenantId,
  currentAmount,
  currentTitle,
  currentDate,
  hasAmendments,
}: {
  txId: number
  tenantId: number
  currentAmount: number
  currentTitle: string
  currentDate: string
  hasAmendments: boolean
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [amount, setAmount] = useState(String(currentAmount))
  const [title, setTitle] = useState(currentTitle)
  const [date, setDate] = useState(currentDate)
  const [note, setNote] = useState('')
  const [amendments, setAmendments] = useState<Amendment[]>([])
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function openEdit() {
    setAmount(String(currentAmount))
    setTitle(currentTitle)
    setDate(currentDate)
    setNote('')
    setEditOpen(true)
  }

  function openHistory() {
    startTransition(async () => {
      const data = await getTransactionAmendments(txId)
      setAmendments(data)
      setHistoryOpen(true)
    })
  }

  function handleSave() {
    const num = parseFloat(amount.replace(',', '.'))
    if (isNaN(num)) {
      toast.error('Nieprawidłowa kwota.')
      return
    }
    startTransition(async () => {
      await updateTransaction(txId, tenantId, { amount: num, title, date }, note || undefined)
      toast.success('Transakcja zaktualizowana.')
      setEditOpen(false)
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={openEdit}
        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Edytuj transakcję"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {hasAmendments && (
        <button
          onClick={openHistory}
          disabled={pending}
          className="p-1 rounded text-amber-500 hover:text-amber-600 hover:bg-muted transition-colors"
          title="Historia korekt"
        >
          <History className="h-3.5 w-3.5" />
        </button>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj transakcję</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Kwota</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="np. 1500.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Tytuł / opis</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Notatka do korekty (opcjonalna)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Powód zmiany..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={pending}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Historia korekt transakcji</DialogTitle>
          </DialogHeader>
          {amendments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Brak historii korekt</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {amendments.map((a) => (
                <div key={a.id} className="rounded-md border p-3 space-y-2 text-sm">
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.amended_at)}</p>
                  {a.note && <p className="text-xs italic text-muted-foreground">{a.note}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Przed</p>
                      <p>Kwota: <span className="font-medium">{formatAmount(a.before_data.amount)}</span></p>
                      <p>Tytuł: <span className="font-medium">{a.before_data.title || '—'}</span></p>
                      <p>Data: <span className="font-medium">{a.before_data.date}</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Po</p>
                      <p>Kwota: <span className="font-medium">{formatAmount(a.after_data.amount)}</span></p>
                      <p>Tytuł: <span className="font-medium">{a.after_data.title || '—'}</span></p>
                      <p>Data: <span className="font-medium">{a.after_data.date}</span></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </span>
  )
}
