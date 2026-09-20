'use client'

import { useQuery } from '@tanstack/react-query'
import { FileText, Eye } from 'lucide-react'
import { getImportHistoryList } from './actions'
import { useFilePreview, FilePreviewDialog } from './file-preview-dialog'
import { formatDateTime } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'

export function ImportHistoryTable() {
  const { data: imports = [], isLoading } = useQuery({
    queryKey: ['importHistory'],
    queryFn: () => getImportHistoryList(),
  })

  const { previewFile, isPreviewLoading, previewError, openPreview, closePreview } = useFilePreview()

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Historia wgranych plików CSV</h2>

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
                  Brak historii wgranych plików.
                </TableCell>
              </TableRow>
            ) : (
              imports.map((item) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = item.after_data as any || {}
                const savedFileName = data.savedFileName
                const originalFileName = data.originalFileName
                const hasFile = !!savedFileName

                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDateTime(item.created_at)}
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
                        onClick={() => hasFile && openPreview(savedFileName, originalFileName)}
                        className="h-8 flex gap-1.5 px-2"
                      >
                        <Eye className="h-4 w-4" /> Podgląd
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <FilePreviewDialog
        previewFile={previewFile}
        isPreviewLoading={isPreviewLoading}
        previewError={previewError}
        onOpenChange={(open) => !open && closePreview()}
      />
    </div>
  )
}
