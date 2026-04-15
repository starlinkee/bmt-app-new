import { notFound } from 'next/navigation'
import { getTenant } from '../actions'
import { getStatement } from '@/lib/statement'
import { calculateBalance } from '@/lib/balance'
import { formatAmount, formatDate } from '@/lib/utils'
import { InvoiceStatusBadge } from '@/components/invoice-status-badge'
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {tenant.first_name} {tenant.last_name}
        </h1>
        <div className="flex gap-2 mt-1">
          <Badge variant="outline">{tenant.tenant_type}</Badge>
          {property && (
            <Badge variant="outline">{property.name || property.address1}</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <CardTitle className="text-sm text-muted-foreground font-normal">Operacje</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{statement.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Wyciąg</h2>
        <AddAdjustmentButton tenantId={tenantId} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Opis</TableHead>
            <TableHead className="text-right">Kwota</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statement.map((entry) => (
            <TableRow key={entry.id}>
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
                {entry.type === 'invoice' && (
                  <InvoiceStatusBadge isPaid={entry.isPaid} />
                )}
              </TableCell>
            </TableRow>
          ))}
          {statement.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Brak operacji
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
