'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'

// Osobny bucket (nie "invoices"), żeby ręcznie wgrane pliki nie mieszały się z plikami z AI.
// Struktura: folder (np. lokal/najemca) / paczka "RRRR-MM-DD_GG-MM-SS" / plik.
const BUCKET = 'manual-uploads'
// Storage nie przechowuje pustych folderów — pusty folder utrzymuje plik-znacznik.
const PLACEHOLDER = '.keep'

export type UploadFile = { name: string; size: number }
export type UploadBatch = { name: string; createdMs: number; files: UploadFile[] }
export type UploadFolder = { name: string; batches: UploadBatch[] }

// Storage odrzuca ("Invalid key") polskie znaki, nawiasy kwadratowe itp. — normalizujemy do ASCII.
function sanitizeSegment(name: string): string {
  return name
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―]/g, '-')
    .replace(/[\\/]/g, '-')
    .replace(/[^A-Za-z0-9 ._()'!#+,@;=-]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
}

function requireSegment(name: string, label: string): string {
  const s = sanitizeSegment(name)
  if (!s) throw new Error(`${label} jest nieprawidłowa.`)
  return s
}

// RRRR-MM-DD_GG-MM-SS w czasie polskim
function batchName(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  // "2026-09-19 14:05:09"
  return parts.replace(' ', '_').replace(/:/g, '-')
}

export async function getUploads(): Promise<UploadFolder[]> {
  const supabase = createServiceClient()
  const { data: folders, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) throw new Error(error.message)

  const result: UploadFolder[] = []
  for (const f of folders ?? []) {
    if (f.id) continue // pliki luzem w korzeniu ignorujemy
    const { data: batchesData } = await supabase.storage.from(BUCKET).list(f.name, { limit: 1000 })
    const batches: UploadBatch[] = []
    for (const b of batchesData ?? []) {
      if (b.id) continue
      const { data: filesData } = await supabase.storage.from(BUCKET).list(`${f.name}/${b.name}`, { limit: 1000 })
      const files = (filesData ?? [])
        .filter((x) => x.id && x.name !== PLACEHOLDER)
        .map((x) => ({ name: x.name, size: Number(x.metadata?.size ?? 0) }))
      batches.push({ name: b.name, createdMs: parseBatchMs(b.name), files })
    }
    batches.sort((a, b) => b.name.localeCompare(a.name))
    result.push({ name: f.name, batches })
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  return result
}

function parseBatchMs(name: string): number {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/)
  if (!m) return 0
  // Nazwa jest w czasie polskim; do wyświetlenia wystarczy przybliżenie jako UTC-lokalne.
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

export async function createUploadFolder(name: string) {
  const folder = requireSegment(name, 'Nazwa folderu')
  const supabase = createServiceClient()
  const { data: existing } = await supabase.storage.from(BUCKET).list('', { search: folder, limit: 100 })
  if (existing?.some((f) => !f.id && f.name === folder)) {
    throw new Error('Folder o takiej nazwie już istnieje.')
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${folder}/${PLACEHOLDER}`, new Uint8Array(0), { contentType: 'text/plain', upsert: true })
  if (error) throw new Error(error.message)
  await logAudit({ actionName: 'createUploadFolder', tableName: 'manual-uploads', operation: 'CREATE', afterData: { info: `Utworzono folder wgranych plików "${folder}"` } })
  return folder
}

async function removeRecursive(prefix: string) {
  const supabase = createServiceClient()
  const paths: string[] = []
  async function walk(p: string) {
    const { data } = await supabase.storage.from(BUCKET).list(p, { limit: 1000 })
    for (const item of data ?? []) {
      if (item.id) paths.push(`${p}/${item.name}`)
      else await walk(`${p}/${item.name}`)
    }
  }
  await walk(prefix)
  if (paths.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths)
    if (error) throw new Error(error.message)
  }
}

export async function deleteUploadFolder(folder: string) {
  await removeRecursive(requireSegment(folder, 'Nazwa folderu'))
  await logAudit({ actionName: 'deleteUploadFolder', tableName: 'manual-uploads', operation: 'DELETE', afterData: { info: `Usunięto folder wgranych plików "${folder}"` } })
}

export async function deleteUploadBatch(folder: string, batch: string) {
  const f = requireSegment(folder, 'Nazwa folderu')
  const b = requireSegment(batch, 'Nazwa podfolderu')
  await removeRecursive(`${f}/${b}`)
  await logAudit({ actionName: 'deleteUploadBatch', tableName: 'manual-uploads', operation: 'DELETE', afterData: { info: `Usunięto wgraną paczkę "${f}/${b}"` } })
}

// Pliki trafiają do Storage bezpośrednio z przeglądarki (limit body Server Actions),
// więc serwer tylko tworzy nowy podfolder i wystawia podpisane adresy uploadu.
export async function prepareUpload(folder: string, fileNames: string[]) {
  if (fileNames.length === 0) throw new Error('Nie wybrano plików.')
  const f = requireSegment(folder, 'Nazwa folderu')
  const batch = batchName()
  const supabase = createServiceClient()

  const used = new Set<string>([PLACEHOLDER])
  const targets: { original: string; path: string; token: string }[] = []
  for (const original of fileNames) {
    let name = sanitizeSegment(original) || 'plik'
    if (used.has(name)) {
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let i = 2
      while (used.has(`${base} (${i})${ext}`)) i++
      name = `${base} (${i})${ext}`
    }
    used.add(name)
    const path = `${f}/${batch}/${name}`
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) throw new Error(error?.message ?? 'Nie udało się przygotować uploadu.')
    targets.push({ original, path, token: data.token })
  }
  await logAudit({ actionName: 'prepareUpload', tableName: 'manual-uploads', operation: 'CREATE', afterData: { info: `Wgrano ${fileNames.length} plik(ów) do "${f}/${batch}"` } })
  return { batch, targets }
}

export async function getUploadFileUrl(folder: string, batch: string, file: string, download = false) {
  const supabase = createServiceClient()
  const path = `${requireSegment(folder, 'Folder')}/${requireSegment(batch, 'Podfolder')}/${file}`
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60, download ? { download: file } : undefined)
  if (error || !data) throw new Error('Nie znaleziono pliku.')
  return data.signedUrl
}
