'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Play, X, CheckCircle2, AlertCircle, Clock, FileText, ImageIcon, File, Download, ExternalLink, FolderOpen } from 'lucide-react'

const SKILLS = [
  {
    id: 'media-lubostron',
    label: 'Media Lubostron',
    description: 'Pobierz odczyty mediów z portalu i wpisz do systemu',
    timeoutMs: 5 * 60 * 1000,
  },
] as const

type SkillId = (typeof SKILLS)[number]['id']
type JobStatus = 'idle' | 'running' | 'done' | 'error'

interface Job {
  jobId: string
  status: JobStatus
  startedAt: number
  timeoutMs: number
}

interface SkillFile {
  name: string
  size: number
  ext: string
}

interface JobFiles {
  files: SkillFile[]
  folder: string | null
}

function Countdown({ startedAt, timeoutMs }: { startedAt: number; timeoutMs: number }) {
  const [remaining, setRemaining] = useState(timeoutMs - (Date.now() - startedAt))

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(timeoutMs - (Date.now() - startedAt))
    }, 1000)
    return () => clearInterval(t)
  }, [startedAt, timeoutMs])

  const secs = Math.max(0, Math.ceil(remaining / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return (
    <span className="font-mono text-lg tabular-nums text-primary font-semibold">
      {m}:{String(s).padStart(2, '0')}
    </span>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ ext }: { ext: string }) {
  if (ext === '.pdf') return <FileText className="h-4 w-4 text-red-500 shrink-0" />
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />
}

function FileBrowser({ jobId, data }: { jobId: string; data: JobFiles }) {
  const { files, folder } = data
  if (!files.length) return null

  const fileUrl = (name: string) =>
    `/api/skill-files?jobId=${encodeURIComponent(jobId)}&file=${encodeURIComponent(name)}`

  const images = files.filter(f => ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(f.ext))

  return (
    <div className="border-t pt-3 mt-1 space-y-3">
      {folder && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="font-mono">{folder}</span>
        </div>
      )}

      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(f => (
            <a
              key={f.name}
              href={fileUrl(f.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded border overflow-hidden hover:opacity-80 transition-opacity"
              title={`Otwórz ${f.name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(f.name)}
                alt={f.name}
                className="h-24 w-auto object-contain bg-muted/30"
              />
            </a>
          ))}
        </div>
      )}

      {/* File list */}
      <div className="space-y-1">
        {files.map(f => (
          <div key={f.name} className="flex items-center gap-2 rounded-md hover:bg-muted/40 px-1 py-0.5 group">
            <FileIcon ext={f.ext} />
            <span className="flex-1 min-w-0 text-sm truncate" title={f.name}>{f.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">{formatSize(f.size)}</span>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <a href={fileUrl(f.name)} target="_blank" rel="noopener noreferrer">
                <Button size="icon" variant="ghost" className="h-6 w-6" title="Otwórz w nowej karcie">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
              <a href={fileUrl(f.name)} download={f.name}>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="Pobierz">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const LS_KEY = 'skill-runner-jobs'

function loadFromStorage(): Partial<Record<SkillId, Job>> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
  } catch { return {} }
}

function saveToStorage(jobs: Partial<Record<SkillId, Job>>) {
  localStorage.setItem(LS_KEY, JSON.stringify(jobs))
}

export function SkillRunner() {
  const [jobs, setJobs] = useState<Partial<Record<SkillId, Job>>>({})
  const [jobFiles, setJobFiles] = useState<Partial<Record<SkillId, JobFiles | null>>>({})
  const intervals = useRef<Partial<Record<SkillId, ReturnType<typeof setInterval>>>>({})
  const fetchedJobIds = useRef<Set<string>>(new Set())

  const stopPolling = useCallback((skillId: SkillId) => {
    if (intervals.current[skillId]) {
      clearInterval(intervals.current[skillId])
      delete intervals.current[skillId]
    }
  }, [])

  const markInterrupted = useCallback((skillId: SkillId, reason: string) => {
    stopPolling(skillId)
    setJobs(prev => ({ ...prev, [skillId]: { ...prev[skillId]!, status: 'error' } }))
    toast.error(reason)
  }, [stopPolling])

  const startPolling = useCallback((skillId: SkillId, jobId: string) => {
    stopPolling(skillId)
    let networkErrors = 0
    intervals.current[skillId] = setInterval(async () => {
      try {
        const res = await fetch(`/api/run-skill?jobId=${jobId}`)
        if (res.status === 404) {
          markInterrupted(skillId, 'Przerwano — serwer utracił stan zadania (restart?).')
          return
        }
        networkErrors = 0
        const data = await res.json()
        if (data.status === 'done' || data.status === 'error') {
          stopPolling(skillId)
          setJobs(prev => ({ ...prev, [skillId]: { ...prev[skillId]!, status: data.status } }))
          if (data.status === 'done') toast.success('Zakończono pomyślnie.')
          else toast.error('Zakończono z błędem.')
        }
      } catch {
        if (++networkErrors >= 3) {
          markInterrupted(skillId, 'Przerwano — brak połączenia ze skill-runnerem.')
        }
      }
    }, 2000)
  }, [stopPolling, markInterrupted])

  useEffect(() => { saveToStorage(jobs) }, [jobs])

  // Fetch files when a job completes
  useEffect(() => {
    for (const [skillId, job] of Object.entries(jobs) as [SkillId, Job][]) {
      if (job?.status === 'done' && job.jobId && !fetchedJobIds.current.has(job.jobId)) {
        fetchedJobIds.current.add(job.jobId)
        fetch(`/api/skill-files?jobId=${job.jobId}`)
          .then(r => r.json())
          .then((data: JobFiles) => setJobFiles(prev => ({ ...prev, [skillId]: data })))
          .catch(() => {})
      }
    }
  }, [jobs])

  useEffect(() => {
    const saved = loadFromStorage()
    if (Object.keys(saved).length === 0) return
    setJobs(saved)
    for (const [skillId, job] of Object.entries(saved) as [SkillId, Job][]) {
      if (job.status !== 'running' || !job.jobId) continue
      fetch(`/api/run-skill?jobId=${job.jobId}`)
        .then(res => {
          if (res.status === 404) markInterrupted(skillId, 'Przerwano — serwer nie znalazł zadania.')
          else startPolling(skillId, job.jobId)
        })
        .catch(() => markInterrupted(skillId, 'Przerwano — brak połączenia ze skill-runnerem.'))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => { Object.values(intervals.current).forEach(v => v && clearInterval(v)) }, [])

  async function runSkill(skill: (typeof SKILLS)[number]) {
    // Clear previous files for this skill
    const prevJob = jobs[skill.id]
    if (prevJob?.jobId) fetchedJobIds.current.delete(prevJob.jobId)
    setJobFiles(prev => ({ ...prev, [skill.id]: undefined }))

    setJobs(prev => ({
      ...prev,
      [skill.id]: { jobId: '', status: 'running', startedAt: Date.now(), timeoutMs: skill.timeoutMs },
    }))
    try {
      const res = await fetch('/api/run-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: skill.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setJobs(prev => ({ ...prev, [skill.id]: { ...prev[skill.id]!, status: 'error' } }))
        toast.error(data.error ?? 'Nieznany błąd')
        return
      }
      setJobs(prev => ({ ...prev, [skill.id]: { ...prev[skill.id]!, jobId: data.jobId } }))
      startPolling(skill.id, data.jobId)
    } catch (err) {
      setJobs(prev => ({ ...prev, [skill.id]: { ...prev[skill.id]!, status: 'error' } }))
      toast.error(`Nie można połączyć z serwerem: ${err instanceof Error ? err.message : err}`)
    }
  }

  async function cancelSkill(skill: (typeof SKILLS)[number]) {
    const job = jobs[skill.id]
    const jobId = job?.jobId
    markInterrupted(skill.id, 'Anulowano ręcznie.')
    if (jobId) {
      await fetch(`/api/run-skill?jobId=${jobId}`, { method: 'DELETE' }).catch(() => {})
    }
  }

  const runningCount = Object.values(jobs).filter(j => j?.status === 'running').length

  return (
    <div className="space-y-4">
      {runningCount > 1 && (
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-medium">{runningCount}</span> automatyzacje działają jednocześnie
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SKILLS.map(skill => {
          const job = jobs[skill.id]
          const status = job?.status ?? 'idle'
          const isRunning = status === 'running'
          const files = jobFiles[skill.id]

          return (
            <div
              key={skill.id}
              className={[
                'flex flex-col gap-4 rounded-xl border p-5 transition-colors',
                isRunning ? 'border-primary/40 bg-primary/5' : 'bg-card',
                status === 'done' ? 'border-green-500/30 bg-green-50/30 dark:bg-green-950/20' : '',
                status === 'error' ? 'border-destructive/30 bg-destructive/5' : '',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-base">{skill.label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{skill.description}</p>
                </div>
                {isRunning && (
                  <button
                    onClick={() => cancelSkill(skill)}
                    className="shrink-0 mt-0.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Anuluj"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 mt-auto">
                <div className="flex items-center gap-2">
                  {isRunning && job && (
                    <>
                      <Clock className="h-4 w-4 text-primary animate-pulse" />
                      <Countdown startedAt={job.startedAt} timeoutMs={job.timeoutMs} />
                    </>
                  )}
                  {status === 'done' && (
                    <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Zakończono
                    </span>
                  )}
                  {status === 'error' && (
                    <span className="flex items-center gap-1.5 text-sm text-destructive font-medium">
                      <AlertCircle className="h-4 w-4" />
                      Przerwano
                    </span>
                  )}
                </div>

                <Button size="sm" disabled={isRunning} onClick={() => runSkill(skill)}>
                  {isRunning ? (
                    'Działa...'
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Uruchom
                    </>
                  )}
                </Button>
              </div>

              {status === 'done' && job?.jobId && files && files.files.length > 0 && (
                <FileBrowser jobId={job.jobId} data={files} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
