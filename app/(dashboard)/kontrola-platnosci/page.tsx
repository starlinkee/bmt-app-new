'use client'

import { useState, useTransition } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTenantsWithBalances, getTenantStatement } from './actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { formatAmount, formatDate } from '@/lib/utils'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type TenantWithBalance = Awaited<ReturnType<typeof getTenantsWithBalances>>[number]
type StatementEntry = Awaited<ReturnType<typeof getTenantStatement>>[number]

export default function KontrolaPlatnosciPage() {
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.kontrolaPlatnosci,
    queryFn: getTenantsWithBalances,
  })

  const [selected, setSelected] = useState<TenantWithBalance | null>(null)
  const [statement, setStatement] = useState<StatementEntry[]>([])
  const [loadingStatement, startTransition] = useTransition()

  function openTenant(tenant: TenantWithBalance) {
    setSelected(tenant)
    setStatement([])
    startTransition(async () => {
      const data = await getTenantStatement(tenant.id)
      setStatement(data.slice().reverse())
    })
  }

  const totalBalance = tenants.reduce((sum, t) => sum + t.balance, 0)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kontrola płatności</h1>
        <div className="text-sm text-muted-foreground">
          Łączne saldo:{' '}
          <span className={`font-semibold ${totalBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {formatAmount(totalBalance)}
          </span>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Najemca</TableHead>
            <TableHead>Nieruchomość</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                Ładowanie…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && tenants.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                Brak najemców
              </TableCell>
            </TableRow>
          )}
          {tenants.map((t) => (
            <TableRow
              key={t.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => openTenant(t)}
            >
              <TableCell className="font-medium">
                <div>{t.first_name} {t.last_name}</div>
                {t.company_name && (
                  <div className="text-xs text-muted-foreground">{t.company_name}</div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.property?.name || t.property?.address1 || '—'}
              </TableCell>
              <TableCell
                className={`text-right font-semibold ${
                  t.balance >= 0 ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {formatAmount(t.balance)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selected?.first_name} {selected?.last_name}
              {selected && (
                <span
                  className={`text-base font-bold ${
                    selected.balance >= 0 ? 'text-green-600' : 'text-destructive'
                  }`}
                >
                  {formatAmount(selected.balance)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Opis</TableHead>
                  <TableHead className="text-right">Kwota</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingStatement && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Ładowanie…
                    </TableCell>
                  </TableRow>
                )}
                {!loadingStatement && statement.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Brak operacji
                    </TableCell>
                  </TableRow>
                )}
                {statement.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(entry.date)}
                    </TableCell>
                    <TableCell className="text-sm">{entry.description}</TableCell>
                    <TableCell
                      className={`text-right text-sm font-medium ${
                        entry.amount >= 0 ? 'text-green-600' : 'text-destructive'
                      }`}
                    >
                      {formatAmount(entry.amount)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatAmount(entry.runningBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
