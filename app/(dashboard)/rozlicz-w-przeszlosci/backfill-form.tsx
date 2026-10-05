'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react'
import {
  executeBackfillRents,
  getBackfillTenants,
  previewBackfillRents,
  type BackfillRow,
} from './actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { MONTHS, MonthYearSelect } from './month-year-select'

type Tenant = Awaited<ReturnType<typeof getBackfillTenants>>[number]
type Preview = { rows: BackfillRow[]; tenantsWithoutContract: number[] }

export function BackfillForm() {
  const now = new Date()
  const [from, setFrom] = useState({ month: 1, year: now.getFullYear() })
  const [to, setTo] = useState({ month: now.getMonth() + 1, year: now.getFullYear() })
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<Preview | null>(null)
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

  // Każda zmiana parametrów unieważnia podgląd - żeby nie dało się
  // zatwierdzić czegoś innego niż to, co widać na ekranie.
  function changeFrom(month: number, year: number) {
    setFrom({ month, year })
    setPreview(null)
  }
  function changeTo(month: number, year: number) {
    setTo({ month, year })
    setPreview(null)
  }
  function changeSelected(next: Set<number>) {
    setSelected(next)
    setPreview(null)
  }

  const allSelected = tenants.length > 0 && selected.size === tenants.length
  const tenantName = (id: number) => tenants.find((t) => t.id === id)?.name ?? `#${id}`

  function toggleTenant(id: number, checked: boolean) {
    const next = new Set(selected)
    if (checked) next.add(id)
    else next.delete(id)
    changeSelected(next)
  }

  function handlePreview() {
    startTransition(async () => {
      try {
        setPreview(await previewBackfillRents([...selected], from, to))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd podglądu.')
      }
    })
  }

  function handleExecute() {
    startTransition(async () => {
      try {
        const { createdCount, skippedCount } = await executeBackfillRents([...selected], from, to)
        toast.success(
          `Dopisano ${createdCount} czynsz(ów).` + (skippedCount ? ` Pominięto ${skippedCount} już istniejących.` : ''),
        )
        setConfirmOpen(false)
        setPreview(await previewBackfillRents([...selected], from, to))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Błąd zapisu.')
      }
    })
  }

  const newRows = preview?.rows.filter((r) => !r.exists) ?? []
  const newTotal = newRows.reduce((s, r) => s + r.amount, 0)

  const selectedLabel =
    selected.size === 0
      ? 'Wybierz najemców'
      : allSelected
        ? `Wszyscy najemcy (${selected.size})`
        : selected.size <= 2
          ? [...selected].map(tenantName).join(', ')
          : `Wybrano: ${selected.size}`

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Rozlicz w przeszłości</h1>

      <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm max-w-3xl">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="font-medium">Uwaga — operacja wpływa na salda najemców.</p>
          <p className="text-muted-foreground">
            Dla każdego wybranego najemcy i każdego miesiąca z zakresu (włącznie z miesiącem
            końcowym) tworzony jest czynsz w systemie, jeśli umowa obowiązywała w tym miesiącu
            i czynsz za ten miesiąc jeszcze nie istnieje. Kwota pochodzi z <b>aktualnej</b> stawki
            umowy. Nie są generowane żadne dokumenty ani wysyłane e-maile.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <MonthYearSelect label="Od" month={from.month} year={from.year} onChange={changeFrom} />
        <MonthYearSelect label="Do (włącznie)" month={to.month} year={to.year} onChange={changeTo} />

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Najemcy</div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="min-w-64 justify-between" disabled={loadingTenants}>
                  <span className="truncate max-w-80">{loadingTenants ? 'Ładowanie…' : selectedLabel}</span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-80 max-h-96 overflow-y-auto">
              <DropdownMenuGroup>
                <DropdownMenuCheckboxItem
                  checked={allSelected}
                  onCheckedChange={(checked) => changeSelected(checked ? new Set(tenants.map((t) => t.id)) : new Set())}
                  className="font-medium"
                >
                  Wszyscy najemcy
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {tenants.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selected.has(t.id)}
                    onCheckedChange={(checked) => toggleTenant(t.id, checked)}
                  >
                    <span className="truncate">
                      {t.name}
                      {t.propertyName && <span className="text-muted-foreground"> · {t.propertyName}</span>}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button onClick={handlePreview} disabled={pending || selected.size === 0}>
          {pending && !confirmOpen && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Pokaż podgląd
        </Button>
      </div>

      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm space-x-4">
              <span>Do utworzenia: <b>{newRows.length}</b> ({formatAmount(newTotal)})</span>
              <span className="text-muted-foreground">
                Już istniejące (pominięte): {preview.rows.length - newRows.length}
              </span>
            </div>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={pending || newRows.length === 0}>
              Dopisz czynsze
            </Button>
          </div>

          {preview.tenantsWithoutContract.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Brak umowy obowiązującej w wybranym zakresie: {preview.tenantsWithoutContract.map(tenantName).join(', ')}
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Najemca</TableHead>
                <TableHead>Umowa</TableHead>
                <TableHead>Miesiąc</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Brak czynszów do utworzenia w tym zakresie.
                  </TableCell>
                </TableRow>
              )}
              {preview.rows.map((r) => (
                <TableRow key={`${r.contractId}-${r.year}-${r.month}`} className={r.exists ? 'text-muted-foreground' : undefined}>
                  <TableCell>{r.tenantName}</TableCell>
                  <TableCell>#{r.contractId}</TableCell>
                  <TableCell>{MONTHS[r.month - 1]} {r.year}</TableCell>
                  <TableCell className="text-right">{formatAmount(r.amount)}</TableCell>
                  <TableCell>{r.exists ? 'Już istnieje' : 'Do utworzenia'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdź dopisanie czynszów</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Zostanie utworzonych <b>{newRows.length}</b> czynszów na łączną kwotę <b>{formatAmount(newTotal)}</b> za
            okres {MONTHS[from.month - 1]} {from.year} – {MONTHS[to.month - 1]} {to.year}. Salda najemców
            zostaną odpowiednio obciążone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button variant="destructive" onClick={handleExecute} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dopisz czynsze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
