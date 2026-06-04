'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FileText,
  ImageIcon,
  File,
  Download,
  ExternalLink,
  FolderOpen,
  Folder,
} from 'lucide-react'

interface SkillFile {
  name: string
  size: number
  ext: string
}

interface RunFolder {
  name: string
  createdMs: number
  files: SkillFile[]
}

interface SkillFolder {
  name: string
  runs: RunFolder[]
}

interface BrowseData {
  skills: SkillFolder[]
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ms: number) {
  const d = new Date(ms)
  return d.toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function FileTypeIcon({ ext }: { ext: string }) {
  if (ext === '.pdf') return <FileText className="h-4 w-4 text-red-500 shrink-0" />
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext))
    return <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />
}

function fileUrl(skillName: string, runName: string, fileName: string) {
  const rel = `${skillName}/${runName}/${fileName}`
  return `/api/skill-files?path=${encodeURIComponent(rel)}`
}

function RunFiles({ skill, run }: { skill: string; run: RunFolder }) {
  const images = run.files.filter(f => ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(f.ext))

  return (
    <div className="pl-4 pt-2 space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(f => (
            <a
              key={f.name}
              href={fileUrl(skill, run.name, f.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded border overflow-hidden hover:opacity-80 transition-opacity"
              title={f.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(skill, run.name, f.name)}
                alt={f.name}
                className="h-20 w-auto object-contain bg-muted/30"
              />
            </a>
          ))}
        </div>
      )}

      <div className="space-y-0.5">
        {run.files.map(f => (
          <div
            key={f.name}
            className="flex items-center gap-2 rounded-md hover:bg-muted/40 px-1 py-1 group"
          >
            <FileTypeIcon ext={f.ext} />
            <span className="flex-1 min-w-0 text-sm truncate" title={f.name}>{f.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">{formatSize(f.size)}</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <a href={fileUrl(skill, run.name, f.name)} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" className="h-6 w-6" title="Otwórz">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
              <a href={fileUrl(skill, run.name, f.name)} download={f.name}>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="Pobierz">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </a>
            </div>
          </div>
        ))}
        {run.files.length === 0 && (
          <p className="text-xs text-muted-foreground px-1">Brak plików w tym folderze</p>
        )}
      </div>
    </div>
  )
}

function RunRow({
  skill,
  run,
  defaultOpen,
}: {
  skill: string
  run: RunFolder
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left rounded-md hover:bg-muted/40 px-2 py-1.5 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" />
        <span className="text-sm font-mono flex-1 truncate" title={run.name}>{run.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{formatDate(run.createdMs)}</span>
        <span className="text-xs text-muted-foreground shrink-0 ml-1">
          {run.files.length} {run.files.length === 1 ? 'plik' : 'pliki/plików'}
        </span>
      </button>
      {open && <RunFiles skill={skill} run={run} />}
    </div>
  )
}

function SkillRow({ skill, defaultOpen }: { skill: SkillFolder; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Folder className="h-5 w-5 text-yellow-400 shrink-0" />
        <span className="font-semibold flex-1">{skill.name}</span>
        <span className="text-sm text-muted-foreground">{skill.runs.length} sesji</span>
      </button>

      {open && skill.runs.length > 0 && (
        <div className="border-t px-3 py-2 space-y-0.5">
          {skill.runs.map((run, i) => (
            <RunRow key={run.name} skill={skill.name} run={run} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {open && skill.runs.length === 0 && (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">Brak sesji</p>
      )}
    </div>
  )
}

export function VpsFileBrowser() {
  const [data, setData] = useState<BrowseData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/skill-files?browse=1')
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `Błąd ${res.status}`)
        return
      }
      const d: BrowseData = await res.json()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Pliki wygenerowane przez automatyzacje na serwerze VPS
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Odśwież
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!error && data && data.skills.length === 0 && (
        <p className="text-sm text-muted-foreground">Brak folderów z wynikami</p>
      )}

      {data && (
        <div className="space-y-3">
          {data.skills.map((skill, i) => (
            <SkillRow key={skill.name} skill={skill} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {loading && !data && (
        <p className="text-sm text-muted-foreground">Ładowanie...</p>
      )}
    </div>
  )
}
