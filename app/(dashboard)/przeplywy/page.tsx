'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAllFlows } from './actions'
import { formatAmount, formatDate } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

const TYPE_LABELS: Record<string, string> = {
  RENT: 'Czynsz',
  MEDIA: 'Media',
  OTHER: 'Inny',
}

export default function PrzeplywyPage() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [filter, setFilter] = useState<'all' | 'invoice' | 'transaction'>('all')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['przeplywy', year],
    queryFn: () => getAllFlows(year),
    staleTime: 2 * 60 * 1000,
  })

  const visible = filter === 'all' ? entries : entries.filter((e) => e.type === filter)

  const totalIn = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const totalOut = entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const net = totalIn - totalOut

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Przepływy</h1>

        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystko</SelectItem>
              <SelectItem value="invoice">Rachunki</SelectItem>
              <SelectItem value="transaction">Wpłaty</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Wpłaty (wchodzące)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatAmount(totalIn)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Rachunki (wychodzące)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatAmount(totalOut)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Bilans netto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${net >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {formatAmount(net)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Najemca</TableHead>
            <TableHead>Opis</TableHead>
            <TableHead className="text-right">Kwota</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Ładowanie…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Brak operacji dla {year}
              </TableCell>
            </TableRow>
          )}
          {visible.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {formatDate(entry.date)}
              </TableCell>
              <TableCell>
                {entry.type === 'invoice' ? (
                  <span className="inline-flex items-center rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                    {entry.invoiceType ? (TYPE_LABELS[entry.invoiceType] ?? entry.invoiceType) : 'Rachunek'}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Wpłata
                  </span>
                )}
              </TableCell>
              <TableCell className="text-sm">{entry.tenantName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{entry.description}</TableCell>
              <TableCell
                className={`text-right text-sm font-medium ${
                  entry.amount >= 0 ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {entry.amount >= 0 ? '+' : ''}
                {formatAmount(entry.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
