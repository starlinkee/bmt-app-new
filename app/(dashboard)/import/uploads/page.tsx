'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, FileText, Eye, AlertCircle, Download } from 'lucide-react'
import { getImportHistoryList, getFileContent } from '../actions'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function UploadsHistoryPage() {
  const { data: imports = [], isLoading } = useQuery({
    queryKey: ['importHistory'],
    queryFn: () => getImportHistoryList(),
  })

  const [previewFile, setPreviewFile] = useState<{ name: string; originalName?: string; content: string } | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  async function handlePreview(fileName: string, originalName?: string) {
    setIsPreviewLoading(true)
    setPreviewError(null)
    setPreviewFile({ name: fileName, originalName, content: '' }) // Open dialog with loading state
    
    try {
      const content = await getFileContent(fileName)
      if (content) {
        setPreviewFile({ name: fileName, originalName, content })
      } else {
        setPreviewError('Nie udało się odczytać pliku. Prawdopodobnie został usunięty lub brakuje do niego uprawnień.')
      }
    } catch (err) {
      setPreviewError('Wystąpił błąd podczas ładowania pliku.')
    } finally {
      setIsPreviewLoading(false)
    }
  }

  function handleDownload() {
    if (!previewFile || !previewFile.content) return
    
    const blob = new Blob([previewFile.content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', previewFile.originalName || previewFile.name)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link
          href="/import"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Import
        </Link>
        <h1 className="text-2xl font-semibold">Historia wgranych plików CSV</h1>
      </div>

      <div className="rounded-md border">
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
                        {(data.withSuggestion > 0 || data.withoutSuggestion > 0) && (
                          <span className="text-xs text-muted-foreground">
                            {data.withSuggestion + data.withoutSuggestion} do zatwierdzenia
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        disabled={!hasFile}
                        onClick={() => hasFile && handlePreview(savedFileName, originalFileName)}
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

      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewFile?.originalName || previewFile?.name?.replace(/^import_[^_]+_/, '') || 'Podgląd pliku'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 relative border rounded-md bg-muted/30">
            {isPreviewLoading ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
                Ładowanie zawartości pliku...
              </div>
            ) : previewError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-red-500">
                <AlertCircle className="h-6 w-6" />
                <p>{previewError}</p>
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <div className="p-4">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-tight">
                    {previewFile?.content}
                  </pre>
                </div>
              </div>
            )}
          </div>
          
          {!isPreviewLoading && !previewError && (
            <div className="flex justify-end pt-2 border-t">
              <Button onClick={handleDownload} variant="secondary" className="gap-2">
                <Download className="h-4 w-4" /> Pobierz plik
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
