import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll } from 'vitest'
import { createTestDbClient, type Db } from './db'

// Testy integracyjne wysyłki maili pracują na koncie właściciela (legacy_owner), które na bazie preview może mieć
// prawdziwe połączenie z Google. Na czas suity podmieniamy je na połączenie testowe (prawdziwe szyfrowanie kluczem
// testowym, refresh token zależny od konta), a po niej przywracamy oryginał. Migawka ląduje najpierw w pliku -
// gdyby proces padł w trakcie, global-setup kolejnego przebiegu przywróci wiersze.

const SNAPSHOT_FILE = path.join(os.tmpdir(), 'bmt-integration-google-snapshot.json')
type Snapshot = { ownerId: string; credentials: Record<string, unknown>[]; connections: Record<string, unknown>[] }

async function legacyOwnerId(db: Db): Promise<string> {
  const { data, error } = await db.from('legacy_owner').select('owner_id').eq('id', 1).single()
  if (error || !data) throw new Error(`Nie udało się odczytać legacy_owner: ${error?.message}`)
  return data.owner_id
}

async function replaceRows(db: Db, snap: Snapshot) {
  await db.from('google_credentials').delete().eq('owner_id', snap.ownerId)
  await db.from('google_connections').delete().eq('owner_id', snap.ownerId)
  // Najpierw połączenie, potem sekret - jak przy zapisie w aplikacji nie ma tu kolejności zależności (brak FK).
  if (snap.connections.length) {
    const { error } = await db.from('google_connections').insert(snap.connections as never)
    if (error) throw new Error(`Nie udało się PRZYWRÓCIĆ google_connections: ${error.message}`)
  }
  if (snap.credentials.length) {
    const { error } = await db.from('google_credentials').insert(snap.credentials as never)
    if (error) throw new Error(`Nie udało się PRZYWRÓCIĆ google_credentials: ${error.message}`)
  }
}

/** Przywraca połączenie Google właściciela z migawki zostawionej przez przerwany przebieg (jeśli taka jest). */
export async function restoreLeftoverGoogleConnection(db: Db): Promise<boolean> {
  if (!fs.existsSync(SNAPSHOT_FILE)) return false
  await replaceRows(db, JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')) as Snapshot)
  fs.rmSync(SNAPSHOT_FILE, { force: true })
  return true
}

/**
 * Na czas bloku `describe` konto właściciela ma połączenie testowe z Google (adres `email`, status connected),
 * po nim wraca stan sprzed testów. Adres NIE może zaczynać się od e2e_test__ (to uruchamia atrapę e2e w lib/email.ts,
 * a testy integracyjne mają sprawdzać prawdziwą ścieżkę z mockiem Gmaila).
 */
export function patchGoogleConnectionForSuite(email = 'integration-sender@gmail.example') {
  let snap: Snapshot | undefined
  let savedKey: string | undefined
  beforeAll(async () => {
    const db = createTestDbClient()
    const ownerId = await legacyOwnerId(db)
    const [{ data: credentials }, { data: connections }] = await Promise.all([
      db.from('google_credentials').select('*').eq('owner_id', ownerId),
      db.from('google_connections').select('*').eq('owner_id', ownerId),
    ])
    snap = { ownerId, credentials: credentials ?? [], connections: connections ?? [] }
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap))

    savedKey = process.env.GOOGLE_TOKEN_KEY_V1
    process.env.GOOGLE_TOKEN_KEY_V1 = randomBytes(32).toString('base64')
    const { saveConnection } = await import('@/lib/google-connection')
    await db.from('google_credentials').delete().eq('owner_id', ownerId)
    await db.from('google_connections').delete().eq('owner_id', ownerId)
    await saveConnection(ownerId, { refreshToken: `refresh-${ownerId}`, scopes: ['https://www.googleapis.com/auth/gmail.send'] }, email)
  })
  afterAll(async () => {
    try {
      if (snap) await replaceRows(createTestDbClient(), snap)
      fs.rmSync(SNAPSHOT_FILE, { force: true })
    } finally {
      if (savedKey === undefined) delete process.env.GOOGLE_TOKEN_KEY_V1
      else process.env.GOOGLE_TOKEN_KEY_V1 = savedKey
    }
  })
}
