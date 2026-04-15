'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { addAdjustment } from './actions'
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
import { Plus } from 'lucide-react'

export function AddAdjustmentButton({ tenantId }: { tenantId: number }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleSave() {
    const num = parseFloat(amount.replace(',', '.'))
    if (isNaN(num)) {
      toast.error('Nieprawidłowa kwota.')
      return
    }
    startTransition(async () => {
      await addAdjustment(tenantId, num, description, date)
      toast.success('Korekta dodana.')
      setOpen(false)
      setAmount('')
      setDescription('')
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> Dodaj korektę
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj korektę</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Kwota</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="np. 500.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Opis</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              Dodaj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
