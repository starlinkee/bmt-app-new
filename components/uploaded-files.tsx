'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FileText,
  ImageIcon,
  File as FileIcon,
  Download,
  Search,
  Folder,
  FolderOpen,
  FolderPlus,
  Upload,
  Trash2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import {
  getUploads,
  createUploadFolder,
  deleteUploadFolder,
  deleteUploadBatch,
  prepareUpload,
  getUploadFileUrl,
  type UploadFolder,
  type UploadBatch,
} from '@/app/(dashboard)/rozlicz-media/uploads-actions'

const BUCKET = 'manual-uploads'
const QUERY_KEY = ['manual_uploads'] as const

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return <FileText className="h-4 w-4 text-red-500 shrink-0" />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
    return <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
  return <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
}

function BatchRow({
  folder,
  batch,
  onDelete,
}: {
  folder: string
  batch: UploadBatch
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)

  async function openFile(file: string, download: boolean) {
    try {
      const url = await getUploadFileUrl(folder, batch.name, file, download)
      if (download) {
        const a = document.createElement('a')
        a.href = url
        a.download = file
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się otworzyć pliku.')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-md hover:bg-muted/40 px-2 py-1.5 group">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
          <span className="text-sm font-mono flex-1 truncate">{batch.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {batch.files.length} {batch.files.length === 1 ? 'plik' : 'plików'}
          </span>
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive"
          title="Usuń ten podfolder"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && (
        <div className="pl-8 pb-1 space-y-0.5">
          {batch.files.map((f) => (
            <div key={f.name} className="flex items-center gap-2 rounded-md hover:bg-muted/40 px-1 py-1">
              <FileTypeIcon name={f.name} />
              <span className="flex-1 min-w-0 text-sm truncate" title={f.name}>{f.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatSize(f.size)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Otwórz"
                onClick={() => openFile(f.name, false)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Pobierz"
                onClick={() => openFile(f.name, true)}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {batch.files.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">Brak plików w tym podfolderze</p>
          )}
        </div>
      )}
    </div>
  )
}

function FolderCard({
  folder,
  uploading,
  onUpload,
  onDelete,
  onDeleteBatch,
}: {
  folder: UploadFolder
  uploading: boolean
  onUpload: (files: File[]) => void
  onDelete: () => void
  onDeleteBatch: (batch: string) => void
}) {
  const [open, setOpen] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Folder className="h-5 w-5 text-yellow-400 shrink-0" />
          <span className="font-semibold truncate">{folder.name}</span>
          <span className="text-sm text-muted-foreground shrink-0">
            {folder.batches.length} wgrań
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length > 0) onUpload(files)
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1.5" />
          )}
          Wgraj pliki
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive"
          title="Usuń folder wraz z zawartością"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="border-t px-3 py-2 space-y-0.5">
          {folder.batches.map((b) => (
            <BatchRow
              key={b.name}
              folder={folder.name}
              batch={b}
              onDelete={() => onDeleteBatch(b.name)}
            />
          ))}
          {folder.batches.length === 0 && (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              Brak wgranych plików — użyj „Wgraj pliki”.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function UploadedFiles() {
  const queryClient = useQueryClient()
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getUploads,
  })
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploadingFolder, setUploadingFolder] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createUploadFolder(newName)
      toast.success('Folder utworzony.')
      setNewOpen(false)
      setNewName('')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się utworzyć folderu.')
    } finally {
      setCreating(false)
    }
  }

  async function handleUpload(folder: string, files: File[]) {
    setUploadingFolder(folder)
    try {
      const { batch, targets } = await prepareUpload(folder, files.map((f) => f.name))
      const supabase = createClient()
      for (let i = 0; i < targets.length; i++) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(targets[i].path, targets[i].token, files[i])
        if (error) throw new Error(`Błąd wgrywania "${files[i].name}": ${error.message}`)
      }
      toast.success(`Wgrano ${files.length} plik(ów) do ${batch}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się wgrać plików.')
    } finally {
      setUploadingFolder(null)
      await refresh()
    }
  }

  async function handleDeleteFolder(folder: UploadFolder) {
    const count = folder.batches.reduce((n, b) => n + b.files.length, 0)
    if (!confirm(`Usunąć folder "${folder.name}" wraz z całą zawartością (${count} plików)? Tej operacji nie można cofnąć.`)) return
    try {
      await deleteUploadFolder(folder.name)
      toast.success('Folder usunięty.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się usunąć folderu.')
    }
    await refresh()
  }

  async function handleDeleteBatch(folder: string, batch: string) {
    if (!confirm(`Usunąć podfolder "${batch}" wraz z plikami? Tej operacji nie można cofnąć.`)) return
    try {
      await deleteUploadBatch(folder, batch)
      toast.success('Podfolder usunięty.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się usunąć podfolderu.')
    }
    await refresh()
  }

  return (
    <div className="pt-10 space-y-4">
      <div className="flex items-center justify-between border-t pt-8">
        <div>
          <h2 className="text-xl font-semibold">Wgrane pliki</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Archiwum ręcznie pobranych plików (np. odczyty, dokumenty kosztowe) używanych do rozliczeń.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Odśwież
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
            Nowy folder
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Błąd ładowania'}
        </div>
      )}

      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">Brak folderów — utwórz pierwszy przyciskiem „Nowy folder”.</p>
      )}

      <div className="space-y-3">
        {data?.map((folder) => (
          <FolderCard
            key={folder.name}
            folder={folder}
            uploading={uploadingFolder === folder.name}
            onUpload={(files) => handleUpload(folder.name, files)}
            onDelete={() => handleDeleteFolder(folder)}
            onDeleteBatch={(b) => handleDeleteBatch(folder.name, b)}
          />
        ))}
      </div>

      {!data && !error && <p className="text-sm text-muted-foreground">Ładowanie...</p>}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Nazwa folderu</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              placeholder="np. nazwa lokalu lub najemcy"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Anuluj</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>Utwórz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
