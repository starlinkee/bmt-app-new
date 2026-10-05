/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js'

// Wspólny "stan uruchomieniowy" testów integracyjnych - granice zewnętrzne
// (SMTP, Supabase Storage) są podmienione w setup.ts na atrapy zapisujące tu,
// co aplikacja próbowała zrobić, dzięki czemu testy mogą to sprawdzać, a nic
// nie wychodzi poza bazę.

export type SentMail = {
  from: string
  to: string | string[]
  subject: string
  html: string
  attachments: { filename: string; content: Buffer }[]
}

export const mailbox = {
  sent: [] as SentMail[],
  /** Gdy ustawione, sendMail rzuca tym błędem (symulacja awarii SMTP). */
  failWith: null as Error | null,
  /** Jak `failWith`, ale tylko dla wiadomości spełniających warunek (np. tylko do admina). */
  failIf: null as ((mail: SentMail) => boolean) | null,
  reset() {
    this.sent = []
    this.failWith = null
    this.failIf = null
  },
}

export type StorageUpload = { bucket: string; path: string; size: number; contentType?: string; upsert?: boolean }

export const storage = {
  uploads: [] as StorageUpload[],
  files: new Map<string, Buffer>(),
  /** Gdy true, upload zwraca błąd jak przy awarii Storage. */
  failUploads: false,
  reset() {
    this.uploads = []
    this.files = new Map()
    this.failUploads = false
  },
}

export function createFakeStorage() {
  return {
    from(bucket: string) {
      return {
        async upload(path: string, body: Buffer | string, opts?: { contentType?: string; upsert?: boolean }) {
          if (storage.failUploads) return { data: null, error: { message: 'symulowana awaria Storage' } }
          const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body)
          storage.uploads.push({ bucket, path, size: buffer.length, contentType: opts?.contentType, upsert: opts?.upsert })
          storage.files.set(`${bucket}/${path}`, buffer)
          return { data: { path }, error: null }
        },
        async download(path: string) {
          const buffer = storage.files.get(`${bucket}/${path}`)
          if (!buffer) return { data: null, error: { message: 'Object not found' } }
          return { data: new Blob([new Uint8Array(buffer)]), error: null }
        },
        async remove(paths: string[]) {
          for (const p of paths) storage.files.delete(`${bucket}/${p}`)
          return { data: [], error: null }
        },
      }
    },
  }
}

// Zawężanie zapytań do danych testowych. Server actions (import, płatności,
// wysyłka zbiorcza) czytają i kasują CAŁE tabele - na współdzielonej bazie
// preview nie wolno im przy tym dotknąć prawdziwych rekordów. `scopeTable`
// dokłada filtr do każdego select/update/delete na danej tabeli, a akcje nawet
// nie wiedzą, że widzą tylko wycinek. Czyszczone po każdym teście.
type Scope = (query: any) => any
const scopes = new Map<string, Scope>()

export function scopeTable(table: string, scope: Scope) {
  scopes.set(table, scope)
}

export function clearScopes() {
  scopes.clear()
}

export function applyScopes(client: SupabaseClient<any>): SupabaseClient<any> {
  const originalFrom = client.from.bind(client)
  ;(client as any).from = (table: string) => {
    const builder: any = originalFrom(table)
    const scope = scopes.get(table)
    if (!scope) return builder
    for (const method of ['select', 'update', 'delete'] as const) {
      const original = builder[method].bind(builder)
      builder[method] = (...args: unknown[]) => scope(original(...args))
    }
    return builder
  }
  return client
}

export function resetRuntime() {
  mailbox.reset()
  storage.reset()
  clearScopes()
}
