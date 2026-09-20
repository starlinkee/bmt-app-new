'use client'

import { useState } from 'react'
import { FileText, AlertCircle, Download } from 'lucide-react'
import { getFileContent } from './actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type PreviewFile = { name: string; originalName?: string }

export function useFilePreview() {
  const [previewFile, setPreviewFile] = useState<{ name: string; originalName?: string; content: string } | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  async function openPreview(fileName: string, originalName?: string) {
    setIsPreviewLoading(true)
    setPreviewError(null)
    setPreviewFile({ name: fileName, originalName, content: '' })

    try {
      const content = await getFileContent(fileName)
      if (content) {
        setPreviewFile({ name: fileName, originalName, content })
      } else {
        setPreviewError('Nie udało się odczytać pliku. Prawdopodobnie został usunięty lub brakuje do niego uprawnień.')
      }
    } catch {
      setPreviewError('Wystąpił błąd podczas ładowania pliku.')
    } finally {
      setIsPreviewLoading(false)
    }
  }

  function closePreview() {
    setPreviewFile(null)
  }

  return { previewFile, isPreviewLoading, previewError, openPreview, closePreview }
}

export function FilePreviewDialog({
  previewFile,
  isPreviewLoading,
  previewError,
  onOpenChange,
}: {
  previewFile: { name: string; originalName?: string; content: string } | null
  isPreviewLoading: boolean
  previewError: string | null
  onOpenChange: (open: boolean) => void
}) {
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
    <Dialog open={!!previewFile} onOpenChange={onOpenChange}>
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
  )
}
