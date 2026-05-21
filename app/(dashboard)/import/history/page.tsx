import Link from 'next/link'
import { getAllTransactions } from '../actions'
import { formatAmount, formatDate } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  MATCHED: 'Dopasowana',
  MANUAL: 'Ręczna',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  MATCHED: 'default',
  MANUAL: 'outline',
}

export default async function TransactionHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const transactions = await getAllTransactions(status)

  const statuses = ['MATCHED', 'MANUAL']

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/import"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Import
        </Link>
        <h1 className="text-2xl font-semibold">Historia transakcji bankowych</h1>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/import/history"
          className={`inline-flex items-center justify-center h-7 rounded px-3 text-xs border transition-colors ${
            !status ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
          }`}
        >
          Wszystkie
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/import/history?status=${s}`}
            className={`inline-flex items-center justify-center h-7 rounded px-3 text-xs border transition-colors ${
              status === s ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{transactions.length} transakcji</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tytuł</TableHead>
            <TableHead>Konto nadawcy</TableHead>
            <TableHead>Najemca</TableHead>
            <TableHead className="text-right">Kwota</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => {
            const tenant = tx.tenants as unknown as { first_name: string; last_name: string } | null
            return (
              <TableRow key={tx.id}>
                <TableCell className="text-sm whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                <TableCell className="text-sm max-w-56 truncate">{tx.title || '—'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {tx.bank_account || '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {tenant ? (
                    <Link
                      href={`/tenants/${tx.tenant_id}`}
                      className="hover:underline"
                    >
                      {tenant.first_name} {tenant.last_name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm font-medium text-green-600">
                  {formatAmount(Number(tx.amount))}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[tx.status ?? 'UNMATCHED']}>
                    {STATUS_LABELS[tx.status ?? 'UNMATCHED']}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
          {transactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Brak transakcji
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
