// Slice 5: kopiuje istniejące pliki ze Storage (buckety 'invoices' i 'manual-uploads') pod prefiks
// właściciela: <owner_id>/<dotychczasowa ścieżka>. Właściciel = legacy_owner.owner_id.
//
//   node scripts/storage-copy-to-owner.mjs           # dry-run (nic nie zapisuje)
//   node scripts/storage-copy-to-owner.mjs --apply   # kopiuje i aktualizuje media_settlements
//
// Bezpieczniki: odmawia pracy, jeśli URL projektu nie zawiera refu preview; NIC nie usuwa (stare
// obiekty zostają); można powtarzać (istniejące cele są pomijane, zmieniane są tylko ścieżki,
// które nadal są "stare"). Dane połączenia czyta z .env.e2e (jak testy integracyjne) albo z env.
// Pomija obiekty, których pierwszy segment jest uuid (już w nowym układzie) oraz `ai-files/`
// w buckecie invoices (pisze je zewnętrzny runner VPS, patrz PROGRESS krok 03).

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const PREVIEW_REF = 'emjiqrfpvdiyodzezzlm'
export const BUCKETS = ['invoices', 'manual-uploads']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Czy obiekt jest "stary" (do skopiowania): bez prefiksu uuid i nie z ai-files/ w invoices. */
export function isLegacyPath(bucket, objectPath) {
  const first = objectPath.split('/')[0]
  if (UUID.test(first)) return false
  if (bucket === 'invoices' && first === 'ai-files') return false
  return true
}

/** Podmienia id w drive_pdf_ids na ścieżki z prefiksem - tylko te, które są skopiowanymi starymi ścieżkami. */
export function rewriteDriveIds(driveIds, ownerId, copiedLegacyPaths) {
  if (!Array.isArray(driveIds)) return { value: driveIds, changed: 0 }
  let changed = 0
  const value = driveIds.map((entry) => {
    if (entry && typeof entry.id === 'string' && copiedLegacyPaths.has(entry.id)) {
      changed++
      return { ...entry, id: `${ownerId}/${entry.id}` }
    }
    return entry
  })
  return { value, changed }
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || m[1] in process.env) continue
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

async function listAll(storage, bucket, prefix = '') {
  const files = []
  const stack = [prefix]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.from(bucket).list(dir, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error(`list ${bucket}/${dir}: ${error.message}`)
      for (const item of data ?? []) {
        const full = dir ? `${dir}/${item.name}` : item.name
        if (item.id) files.push(full)
        else stack.push(full)
      }
      if (!data || data.length < 100) break
    }
  }
  return files
}

async function main() {
  const apply = process.argv.includes('--apply')
  loadEnvFile(path.resolve(process.cwd(), '.env.e2e'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (uzupełnij .env.e2e).')
  if (!url.includes(PREVIEW_REF)) {
    console.error(`ODMOWA: URL projektu nie zawiera refu preview (${PREVIEW_REF}). Ten skrypt działa wyłącznie na preview.`)
    process.exit(2)
  }

  const supabase = createClient(url, key)
  const { data: legacy, error: legacyError } = await supabase.from('legacy_owner').select('owner_id').eq('id', 1).single()
  if (legacyError || !legacy) throw new Error(`legacy_owner: ${legacyError?.message}`)
  const owner = legacy.owner_id
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} | projekt ${PREVIEW_REF} | właściciel ${owner}`)

  let mismatch = false
  const copiedLegacy = new Set() // ścieżki invoices skopiowane (lub już obecne pod prefiksem)

  for (const bucket of BUCKETS) {
    const all = await listAll(supabase.storage, bucket)
    const legacyPaths = all.filter((p) => isLegacyPath(bucket, p))
    const existing = new Set(all.filter((p) => p.startsWith(`${owner}/`)))
    let copied = 0
    let skipped = 0
    const failed = []

    for (const src of legacyPaths) {
      const dest = `${owner}/${src}`
      if (existing.has(dest)) {
        skipped++
        if (bucket === 'invoices') copiedLegacy.add(src)
        continue
      }
      if (!apply) { copied++; continue }
      const { error } = await supabase.storage.from(bucket).copy(src, dest)
      if (error) failed.push(`${src}: ${error.message}`)
      else {
        copied++
        if (bucket === 'invoices') copiedLegacy.add(src)
      }
    }

    // Po kopiowaniu: policz obiekty pod prefiksem właściciela i sprawdź, że każdy stary ma swój cel.
    let underOwner = existing.size
    if (apply) {
      const after = await listAll(supabase.storage, bucket, owner)
      const afterSet = new Set(after.map((p) => `${owner}/${p}`))
      underOwner = afterSet.size
      const missing = legacyPaths.filter((p) => !afterSet.has(`${owner}/${p}`))
      if (missing.length > 0 || failed.length > 0) {
        mismatch = true
        console.error(`  [${bucket}] BRAKUJE ${missing.length} celów, błędów kopiowania: ${failed.length}`)
        for (const f of failed.slice(0, 10)) console.error(`    ${f}`)
      }
    }
    console.log(`[${bucket}] legacy przed: ${legacyPaths.length} | ${apply ? 'skopiowane' : 'do skopiowania'}: ${copied} | pominięte (cel istnieje): ${skipped} | pod <owner>/ ${apply ? 'po' : 'teraz'}: ${underOwner}`)
    if (apply && underOwner < legacyPaths.length) mismatch = true
  }

  // media_settlements.drive_pdf_ids[].id: pełna ścieżka w buckecie invoices (inne wartości, np. id z Drive, zostają).
  const { data: rows, error: rowsError } = await supabase.from('media_settlements').select('id, drive_pdf_ids').eq('owner_id', owner)
  if (rowsError) throw new Error(`media_settlements: ${rowsError.message}`)
  let changedRows = 0
  for (const row of rows ?? []) {
    const { value, changed } = rewriteDriveIds(row.drive_pdf_ids, owner, copiedLegacy)
    if (changed === 0) continue
    changedRows++
    if (apply) {
      const { error } = await supabase.from('media_settlements').update({ drive_pdf_ids: value }).eq('id', row.id)
      if (error) { mismatch = true; console.error(`  media_settlements ${row.id}: ${error.message}`) }
    }
  }
  console.log(`[media_settlements] wiersze ${apply ? 'zmienione' : 'do zmiany'}: ${changedRows} (z ${rows?.length ?? 0})`)

  if (mismatch) {
    console.error('LICZBY SIĘ NIE ZGADZAJĄ - sprawdź błędy powyżej.')
    process.exit(1)
  }
  console.log(apply ? 'OK: liczby zgodne.' : 'Dry-run zakończony (nic nie zapisano). Dodaj --apply, by skopiować.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
