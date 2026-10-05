'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { getBackfillTenants } from '../rozlicz-w-przeszlosci/actions'
import { MONTHS, MonthYearSelect } from '../rozlicz-w-przeszlosci/month-year-select'
import { getMediaBackfillMonths, saveMediaBackfill, type MediaBackfillMonth } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchSelect } from '@/components/ui/search-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatAmount } from '@/lib/utils'
import { parseAmountInput } from '@/lib/rents-backfill'

type Tenant = Awaited<ReturnType<typeof getBackfillTenants>>[number]

const monthKey = (m: { month: number; year: number }) => `${m.month}-${m.year}`

export function MediaBackfillForm() {
  const now = new Date()
  const [from, setFrom] = useState({ month: 1, year: now.getFullYear() })
  const [to, setTo] = useState({ month: now.getMonth() + 1, year: now.getFullYear() })
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [months, setMonths] = useState<MediaBackfillMonth[] | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loadingTenants, startLoadingTenants] = useTransition()
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startLoadingTenants(async () => {
      try {
        setTenants(await getBackfillTenants())
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Nie udało się pobrać najemców.')
      }
    })
  }, [])

  // Zmiana najemcy/zakresu unieważnia formularz - żeby kwoty nie "przeskoczyły"
  // na innego najemcę lub inne miesiące.
  function resetMonths() {
    setMonths(null)
    setAmounts({})
  }

  function loadMonths() {
    startTransition(async () => {
      try {
        setMonths(await getMediaBackfillMonths(Number(tenantId), from, to))
        setAmounts({})
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd ładowania miesięcy.')
      }
    })
  }

  const editable = (months ?? []).filter((m) => m.existingAmount === null && m.contractId !== null)
  const parsed = editable.map((m) => ({ ...m, amount: parseAmountInput(amounts[monthKey(m)] ?? '') }))
  const invalid = parsed.filter((p) => Number.isNaN(p.amount))
  const toSave = parsed.filter((p): p is typeof p & { amount: number } => p.amount !== null && !Number.isNaN(p.amount))
  const total = toSave.reduce((s, p) => s + p.amount, 0)
  const tenantName = tenants.find((t) => String(t.id) === tenantId)?.name ?? ''

  function handleSave() {
    startTransition(async () => {
      try {
        const { createdCount } = await saveMediaBackfill(
          Number(tenantId),
          from,
          to,
          toSave.map(({ month, year, amount }) => ({ month, year, amount })),
        )
        toast.success(`Dodano ${createdCount} rachunek(ów) za media.`)
        setConfirmOpen(false)
        setMonths(await getMediaBackfillMonths(Number(tenantId), from, to))
        setAmounts({})
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zapisu.')
      }
    })
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Media w przeszłości</h1>

      <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm max-w-3xl">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="font-medium">Uwaga — operacja wpływa na saldo najemcy.</p>
          <p className="text-muted-foreground">
            Formularz do wpisania historycznych rachunków za media. Dla każdego miesiąca, w którym
            wpiszesz kwotę, zostanie utworzone obciążenie za media — bez rozliczania w arkuszu,
            bez generowania noty i bez wysyłki e-maili. Puste pola są pomijane.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Najemca</div>
          <SearchSelect
            className="w-80"
            options={tenants.map((t) => ({
              value: String(t.id),
              label: t.name,
              description: t.propertyName ?? undefined,
            }))}
            value={tenantId}
            onValueChange={(v) => {
              setTenantId(v)
              resetMonths()
            }}
            placeholder={loadingTenants ? 'Ładowanie…' : 'Wybierz najemcę'}
          />
        </div>
        <MonthYearSelect
          label="Od"
          month={from.month}
          year={from.year}
          onChange={(month, year) => {
            setFrom({ month, year })
            resetMonths()
          }}
        />
        <MonthYearSelect
          label="Do (włącznie)"
          month={to.month}
          year={to.year}
          onChange={(month, year) => {
            setTo({ month, year })
            resetMonths()
          }}
        />
        <Button onClick={loadMonths} disabled={pending || !tenantId}>
          {pending && !months && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Pokaż miesiące
        </Button>
      </div>

      {months && (
        <div className="space-y-4 max-w-3xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Miesiąc</TableHead>
                <TableHead>Kwota za media</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => {
                const key = monthKey(m)
                const isInvalid = Number.isNaN(parseAmountInput(amounts[key] ?? ''))
                return (
                  <TableRow key={key}>
                    <TableCell>{MONTHS[m.month - 1]} {m.year}</TableCell>
                    <TableCell>
                      {m.existingAmount !== null ? (
                        <span className="text-muted-foreground">{formatAmount(m.existingAmount)}</span>
                      ) : m.contractId === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Input
                          inputMode="decimal"
                          className="w-40"
                          placeholder="0,00"
                          value={amounts[key] ?? ''}
                          aria-invalid={isInvalid || undefined}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.existingAmount !== null
                        ? 'Już istnieje'
                        : m.contractId === null
                          ? 'Brak umowy w tym miesiącu'
                          : isInvalid
                            ? <span className="text-destructive">Nieprawidłowa kwota</span>
                            : ''}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              Do dodania: <b>{toSave.length}</b> ({formatAmount(total)})
            </div>
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={pending || toSave.length === 0 || invalid.length > 0}
            >
              Dodaj rachunki
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdź dodanie rachunków za media</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Najemca <b>{tenantName}</b> zostanie obciążony <b>{toSave.length}</b> rachunkami za media na
            łączną kwotę <b>{formatAmount(total)}</b>.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button variant="destructive" onClick={handleSave} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dodaj rachunki
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
