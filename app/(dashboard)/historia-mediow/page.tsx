'use client'

import { useQuery } from '@tanstack/react-query'
import { getMediaHistory } from './actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

type MediaHistoryRow = Awaited<ReturnType<typeof getMediaHistory>>[number]
type DrivePdfEntry = { name: string; id: string }

const MONTH_NAMES = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
]

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Wpisy z ręcznego panelu Testowanie zapisują spreadsheet_id jako
// 'TEST_MANUAL' - nie ma tam żadnego arkusza ani PDF-a, więc dla takich
// wierszy nie pokazujemy żadnych linków. To samo pole rozróżnia źródło
// wystawienia - analogicznie do kolumny `source` na `invoices`
// (patrz supabase/migrations/20260911150000_invoices_generation_source.sql):
// MANUAL = prawdziwe rozliczenie przez arkusz (/media, /rozlicz-media),
// TEST_MANUAL = testowe wystawienie z panelu /testowanie.
function isTestManual(row: MediaHistoryRow) {
  return row.spreadsheet_id === 'TEST_MANUAL'
}

function SourceBadge({ row }: { row: MediaHistoryRow }) {
  const testManual = isTestManual(row)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold',
        testManual ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800',
      )}
    >
      {testManual ? 'Testowo (panel testowy)' : 'Ręcznie (arkusz)'}
    </span>
  )
}

function getSheetLink(row: MediaHistoryRow): string | null {
  if (isTestManual(row) || !row.spreadsheet_id) return null
  return `https://docs.google.com/spreadsheets/d/${row.spreadsheet_id}/edit`
}

function getPdfEntries(row: MediaHistoryRow): DrivePdfEntry[] {
  if (isTestManual(row)) return []
  const raw = row.drive_pdf_ids
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e): e is DrivePdfEntry => !!e && typeof e === 'object' && 'id' in e && 'name' in e,
  )
}

function LinkCell({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-muted-foreground">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}

export default function MediaHistoryPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.mediaHistory,
    queryFn: getMediaHistory,
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Historia mediów</h1>
        <div className="text-sm text-muted-foreground">{rows.length} wpisów</div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Grupa</TableHead>
            <TableHead className="w-40">Okres</TableHead>
            <TableHead className="w-44">Wykonano</TableHead>
            <TableHead className="w-48">Źródło</TableHead>
            <TableHead>Arkusz (obliczenia)</TableHead>
            <TableHead>PDF wysłany najemcom</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Ładowanie…</TableCell>
            </TableRow>
          )}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Brak wpisów</TableCell>
            </TableRow>
          )}
          {rows.map((row) => {
            const pdfEntries = getPdfEntries(row)
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {(row.settlement_groups as { name: string } | null)?.name ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {MONTH_NAMES[row.month - 1] ?? row.month} {row.year}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatDateTime(row.created_at)}
                </TableCell>
                <TableCell>
                  <SourceBadge row={row} />
                </TableCell>
                <TableCell>
                  <LinkCell href={getSheetLink(row)} label="Otwórz arkusz" />
                </TableCell>
                <TableCell>
                  {pdfEntries.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {pdfEntries.map((pdf) => (
                        <LinkCell
                          key={pdf.id}
                          href={`/api/media-settlement-pdf/${pdf.id}`}
                          label={pdf.name}
                        />
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
