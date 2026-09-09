import { notFound } from 'next/navigation'
import type { StatementEntry } from '@/types/app'
import { getTenant } from '../actions'
import { getStatement } from '@/lib/statement'
import { calculateBalance } from '@/lib/balance'
import { formatAmount, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AddAdjustmentButton } from './add-adjustment-button'
import { EditTransactionButton } from './edit-transaction-button'

const TX_STATUS_LABEL: Record<string, string> = {
  MATCHED: 'Auto',
  MANUAL: 'Ręczna',
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const tenantId = Number(id)

  const [tenant, statement, balance] = await Promise.all([
    getTenant(tenantId).catch(() => null),
    getStatement(tenantId),
    calculateBalance(tenantId),
  ])

  if (!tenant) notFound()

  const property = tenant.properties as unknown as { name: string; address1: string } | null
  const activeContract = (tenant.contracts as unknown as { is_active: boolean; rent_amount: number }[])
    ?.find((c) => c.is_active)

  let totalBilled = 0
  let totalPaid = 0
  let lastPayment: { date: string, amount: number } | null = null
  
  for (const e of statement) {
    if (e.type === 'invoice') {
      totalBilled += Math.abs(e.amount)
    } else if (e.type === 'transaction' && e.amount > 0) {
      totalPaid += e.amount
      lastPayment = { date: e.date, amount: e.amount }
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {tenant.first_name} {tenant.last_name}
        </h1>
        <div className="flex gap-2 mt-1">
          <Badge variant="outline" className="font-mono">ID: {tenant.id}</Badge>
          {property && (
            <Badge variant="outline">{property.name || property.address1}</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {formatAmount(balance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Aktywna umowa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {activeContract ? formatAmount(activeContract.rent_amount) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Suma naliczeń</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {formatAmount(totalBilled)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Suma wpłat</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatAmount(totalPaid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Ostatnia wpłata</CardTitle>
          </CardHeader>
          <CardContent>
            {lastPayment ? (
              <>
                <p className="text-2xl font-bold text-green-600">{formatAmount(lastPayment.amount)}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(lastPayment.date)}</p>
              </>
            ) : (
              <p className="text-2xl font-bold">—</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Operacje</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statement.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Wyciąg</h2>
        <div className="flex items-center gap-2">
          <AddAdjustmentButton tenantId={tenantId} />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Opis</TableHead>
            <TableHead className="text-right">Kwota</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Pochodzenie</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(statement as StatementEntry[]).map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-xs text-muted-foreground font-mono">{entry.id}</TableCell>
              <TableCell className="text-sm">{formatDate(entry.date)}</TableCell>
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
              <TableCell>
                {entry.type === 'transaction' && entry.txStatus && TX_STATUS_LABEL[entry.txStatus] && (
                  <Badge variant="outline" className="text-xs">
                    {TX_STATUS_LABEL[entry.txStatus]}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {entry.type === 'transaction' && entry.rawTxId != null && (
                  <EditTransactionButton
                    txId={entry.rawTxId}
                    tenantId={tenantId}
                    currentAmount={entry.amount}
                    currentTitle={entry.description}
                    currentDate={entry.date}
                    hasAmendments={entry.hasAmendments ?? false}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
          {statement.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                Brak operacji
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
