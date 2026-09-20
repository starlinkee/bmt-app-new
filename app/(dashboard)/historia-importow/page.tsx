'use client'

import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Eye, ChevronRight, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { getImportHistoryList, getImportTransactions } from '../import/actions'
import { useFilePreview, FilePreviewDialog } from '../import/file-preview-dialog'
import { formatAmount, formatDate, formatDateTime } from '@/lib/utils'
import { TRANSACTION_STATUS_LABELS, TRANSACTION_STATUS_VARIANTS } from '@/lib/transactionStatus'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Czynsz',
  MEDIA: 'Media',
}

function ImportDetailRows({ importId }: { importId: number }) {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['importDetail', importId],
    queryFn: () => getImportTransactions(importId),
  })

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">
          Ładowanie transakcji...
        </TableCell>
      </TableRow>
    )
  }

  if (transactions.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">
          Brak transakcji powiązanych z tym importem.
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {transactions.map((tx) => (
        <TableRow key={`${tx.source}-${tx.id}`} className="bg-muted/30">
          <TableCell className="text-sm whitespace-nowrap pl-10">{formatDate(tx.date)}</TableCell>
          <TableCell className="text-sm max-w-56 truncate">{tx.title || '—'}</TableCell>
          <TableCell className="text-sm">
            {tx.tenant ? (
              <span>{tx.tenant.first_name} {tx.tenant.last_name}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
          <TableCell className="text-right text-sm font-medium text-green-600">
            {formatAmount(tx.amount)}
          </TableCell>
          <TableCell>
            <Badge variant={TRANSACTION_STATUS_VARIANTS[tx.status] ?? 'outline'}>
              {TRANSACTION_STATUS_LABELS[tx.status] ?? tx.status}
            </Badge>
            {tx.category && (
              <span className="ml-2 text-xs text-muted-foreground">{CATEGORY_LABELS[tx.category] ?? tx.category}</span>
            )}
            {tx.description && (
              <span className="ml-2 text-xs text-muted-foreground italic" title={tx.description}>
                {tx.description}
              </span>
            )}
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

export default function ImportHistoryPage() {
  const { data: imports = [], isLoading } = useQuery({
    queryKey: ['importHistory'],
    queryFn: () => getImportHistoryList(),
  })

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const { previewFile, isPreviewLoading, previewError, openPreview, closePreview } = useFilePreview()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Historia importów</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Lista wgranych wyciągów bankowych — rozwiń wiersz, żeby zobaczyć które transakcje zostały z niego zaakceptowane, odrzucone lub wciąż czekają na zatwierdzenie.
      </p>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data wgrania</TableHead>
              <TableHead>Nazwa pliku</TableHead>
              <TableHead>Okres</TableHead>
              <TableHead className="text-right">Transakcje</TableHead>
              <TableHead className="text-center">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Ładowanie historii...
                </TableCell>
              </TableRow>
            ) : imports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Brak historii importów.
                </TableCell>
              </TableRow>
            ) : (
              imports.map((item) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = item.after_data as any || {}
                const savedFileName = data.savedFileName
                const originalFileName = data.originalFileName
                const hasFile = !!savedFileName
                const isExpanded = expandedId === item.id

                return (
                  <Fragment key={item.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          {formatDateTime(item.created_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 max-w-[250px]">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate" title={originalFileName || savedFileName || 'Nieznany'}>
                            {originalFileName || (savedFileName ? savedFileName.replace(/^import_[^_]+_/, '') : 'Nieznany plik')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {data.minDate && data.maxDate ? `${data.minDate} - ${data.maxDate}` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <div className="flex flex-col items-end">
                          <span className="font-medium">{data.total || 0} wczytanych</span>
                          {item.pendingCount > 0 ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                              {item.pendingCount} do zatwierdzenia
                            </span>
                          ) : (item.acceptedCount > 0 || item.rejectedCount > 0) ? (
                            <span className="text-xs text-muted-foreground">
                              {item.acceptedCount > 0 && item.rejectedCount > 0
                                ? `zatwierdzono ${item.acceptedCount}, odrzucono ${item.rejectedCount}`
                                : item.rejectedCount > 0
                                  ? 'wszystkie odrzucone'
                                  : 'wszystkie zatwierdzone'}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!hasFile}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (hasFile) openPreview(savedFileName, originalFileName)
                          }}
                          className="h-8 flex gap-1.5 px-2"
                        >
                          <Eye className="h-4 w-4" /> Podgląd
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && <ImportDetailRows importId={item.id} />}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Pełną, płaską listę wszystkich transakcji bankowych znajdziesz w{' '}
        <Link href="/import/history" className="underline hover:text-foreground">historii przelewów</Link>.
      </p>

      <FilePreviewDialog
        previewFile={previewFile}
        isPreviewLoading={isPreviewLoading}
        previewError={previewError}
        onOpenChange={(open) => !open && closePreview()}
      />
    </div>
  )
}
