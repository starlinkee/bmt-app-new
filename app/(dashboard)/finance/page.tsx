'use client'

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getRentPreview, generateRents, getRentInvoices } from './actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { MonthYearPicker } from '@/components/month-year-picker'
import { Button } from '@/components/ui/button'
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
import { formatAmount } from '@/lib/utils'

export default function FinancePage() {
  const now = new Date()
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getRentPreview>> | null>(null)
  const [progress, setProgress] = useState(0)
  const [pending, startTransition] = useTransition()

  const { data: invoices = [] } = useQuery({
    queryKey: QUERY_KEYS.rentInvoices(month, year),
    queryFn: () => getRentInvoices(month, year),
    staleTime: 2 * 60 * 1000, // 2 minuty — faktury mogą być generowane częściej
  })

  function handlePreview() {
    startTransition(async () => {
      const p = await getRentPreview(month, year)
      setPreview(p)
      setConfirmOpen(true)
    })
  }

  function handleGenerate() {
    const total = (preview?.withEmail?.length ?? 0) + (preview?.withoutEmail?.length ?? 0)

    // Asymptotyczny progress
    setProgress(0)
    const interval = setInterval(() => {
      setProgress((p) => {
        const delta = (95 - p) * 0.05
        return Math.min(p + delta, 94)
      })
    }, 200)

    startTransition(async () => {
      try {
        const results = await generateRents(month, year)
        clearInterval(interval)
        setProgress(100)
        toast.success(`Wystawiono ${results.length} czynszów.`)
        setConfirmOpen(false)
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rentInvoices(month, year) })
      } catch {
        clearInterval(interval)
        setProgress(0)
        toast.error('Błąd podczas wystawiania czynszów.')
      }
    })
  }

  const previewTotal =
    (preview?.withEmail?.length ?? 0) + (preview?.withoutEmail?.length ?? 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Finanse — czynsze</h1>
      </div>

      <div className="flex items-center gap-4">
        <MonthYearPicker
          month={month}
          year={year}
          onMonthChange={setMonth}
          onYearChange={setYear}
        />
        <Button onClick={handlePreview} disabled={pending}>
          Wystaw czynsze
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Numer</TableHead>
            <TableHead>Najemca</TableHead>
            <TableHead className="text-right">Kwota</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => {
            const tenant = inv.tenants as unknown as { first_name: string; last_name: string } | null
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-mono">{inv.number}</TableCell>
                <TableCell>
                  {tenant?.first_name} {tenant?.last_name}
                </TableCell>
                <TableCell className="text-right">{formatAmount(Number(inv.amount))}</TableCell>
              </TableRow>
            )
          })}
          {invoices.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                Brak czynszów dla {month}/{year}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdzenie — {month}/{year}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium mb-1">
                Z e-mailem ({preview?.withEmail?.length ?? 0}):
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {(preview?.withEmail ?? []).map((c) => {
                  const t = c.tenants as unknown as { first_name: string; last_name: string } | null
                  return (
                    <li key={c.id}>
                      {t?.first_name} {t?.last_name} — {formatAmount(Number(c.rent_amount))}
                    </li>
                  )
                })}
              </ul>
            </div>
            {(preview?.withoutEmail?.length ?? 0) > 0 && (
              <div>
                <p className="font-medium mb-1">
                  Bez e-maila ({preview?.withoutEmail?.length ?? 0}):
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {(preview?.withoutEmail ?? []).map((c) => {
                    const t = c.tenants as unknown as {
                      first_name: string
                      last_name: string
                    } | null
                    return (
                      <li key={c.id}>
                        {t?.first_name} {t?.last_name} — {formatAmount(Number(c.rent_amount))}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {progress > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleGenerate} disabled={pending || previewTotal === 0}>
              Wystaw ({previewTotal})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
