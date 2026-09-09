'use client'

import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getDbTableRows } from './actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Database, ChevronLeft, ChevronRight, Loader2, Eye } from 'lucide-react'

const TABLE_OPTIONS = [
  { value: 'tenants', label: 'Najemcy' },
  { value: 'properties', label: 'Nieruchomości' },
  { value: 'contracts', label: 'Umowy' },
  { value: 'invoices', label: 'Faktury / rachunki' },
  { value: 'transactions', label: 'Transakcje' },
  { value: 'transaction_staging', label: 'Staging transakcji (import)' },
  { value: 'transaction_amendments', label: 'Korekty transakcji' },
  { value: 'settlement_groups', label: 'Grupy rozliczeniowe mediów' },
  { value: 'settlement_group_properties', label: 'Nieruchomości w grupach' },
  { value: 'media_settlements', label: 'Rozliczenia mediów' },
  { value: 'media_meter_readings', label: 'Odczyty liczników' },
  { value: 'app_config', label: 'Ustawienia aplikacji' },
  { value: 'profiles', label: 'Profile użytkowników' },
  { value: 'operation_log', label: 'Log operacji (crony)' },
  { value: 'audit_log', label: 'Log audytu' },
  { value: 'email_logs', label: 'Log e-maili' },
  { value: 'skill_prompts', label: 'Prompty skill-runnera' },
] as const

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export default function BazaDanychPage() {
  const [table, setTable] = useState<string>(TABLE_OPTIONS[0].value)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['db_browser', table, page, pageSize],
    queryFn: () => getDbTableRows(table, page, pageSize),
    placeholderData: keepPreviousData,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  function handleTableChange(value: string | null) {
    if (!value) return
    setTable(value)
    setPage(1)
  }

  function handlePageSizeChange(value: string | null) {
    if (!value) return
    setPageSize(Number(value))
    setPage(1)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Database className="h-5 w-5" />
            Baza danych
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Podgląd surowych danych 1:1 z bazy — tylko do odczytu, niczego tu nie da się zmienić.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={table} onValueChange={handleTableChange}>
          <SelectTrigger className="w-80">
            <SelectValue placeholder="Wybierz tabelę" />
          </SelectTrigger>
          <SelectContent>
            {TABLE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}{' '}
                <span className="text-muted-foreground font-mono text-xs">({t.value})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / stronę
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFetching && !isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {data && (
          <div className="ml-auto text-sm text-muted-foreground">
            Łącznie: {data.total} {data.total === 1 ? 'wiersz' : 'wierszy'}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Błąd wczytywania danych: {error instanceof Error ? error.message : String(error)}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Wczytywanie...
        </div>
      ) : data && data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-8">Tabela jest pusta.</p>
      ) : data ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {data.columns.map((col) => (
                  <TableHead
                    key={col}
                    className="font-mono text-xs"
                    style={col === 'id' ? { minWidth: '4rem' } : undefined}
                  >
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, i) => (
                <TableRow key={i}>
                  {data.columns.map((col) => (
                    <TableCell
                      key={col}
                      className={col === 'id' ? 'align-top' : 'align-top max-w-xs'}
                      style={col === 'id' ? { minWidth: '4rem' } : undefined}
                    >
                      <pre
                        className={
                          col === 'id'
                            ? 'm-0 whitespace-nowrap font-mono text-xs'
                            : 'm-0 whitespace-pre-wrap break-all font-mono text-xs'
                        }
                      >
                        {formatCellValue(row[col])}
                      </pre>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {data && data.rows.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Strona {data.page} z {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Poprzednia
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Następna
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
