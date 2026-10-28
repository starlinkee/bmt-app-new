// Slice 7a: rotacja klucza szyfrującego refresh tokeny Google (tabela google_credentials).
// Przeszyfrowuje wiersze z key_version < bieżąca (najwyższe GOOGLE_TOKEN_KEY_V<n> w env) kluczem bieżącym,
// z tym samym owner_id jako AAD, i ustawia rotated_at. Klucze wszystkich używanych wersji muszą być w env.
//
//   node scripts/google-key-rotate.mjs --env-file=.env.e2e           # dry-run (nic nie zapisuje)
//   node scripts/google-key-rotate.mjs --env-file=.env.e2e --apply   # przeszyfrowuje
//   ... --env-file=.env.prod --allow-ref=<ref>                       # inny projekt (np. produkcja)
//
// Bezpieczniki jak w storage-copy-to-owner.mjs: domyślnie tylko preview, inny projekt wymaga jawnego
// --allow-ref z dokładnym refem. Idempotentny (po rotacji nic nie zostaje do zrobienia), wiersz jest
// aktualizowany warunkowo (po starym key_version), więc równoległy przebieg nie nadpisze nowszych danych.
// Raport to same liczby: bez sekretów, tokenów i kluczy.

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { PREVIEW_REF, argValue, checkProjectRef, loadEnvFile } from './storage-copy-to-owner.mjs'
import { currentKeyVersion, fromPgBytea, reencrypt, toPgBytea } from '../lib/secret-box-core.mjs'

/**
 * Przeszyfrowuje wiersze ze starszą wersją klucza. `store` ma dwie metody (prawdziwa implementacja: Supabase):
 *   list() -> [{ owner_id, refresh_token_ct, iv, key_version }]
 *   update(row, sealed) -> { error } (zapis warunkowy po starym key_version)
 * @param {any} store
 * @param {{ apply: boolean, env?: Record<string, string | undefined> }} opts
 * @returns {Promise<{ total: number, toRotate: number, rotated: number, errors: number }>}
 */
export async function rotateAll(store, { apply, env = process.env }) {
  const current = currentKeyVersion(env)
  const rows = await store.list()
  const stats = { total: rows.length, toRotate: 0, rotated: 0, errors: 0 }
  for (const row of rows) {
    if (row.key_version >= current) continue
    stats.toRotate++
    try {
      const sealed = { ct: fromPgBytea(row.refresh_token_ct), iv: fromPgBytea(row.iv), keyVersion: row.key_version }
      const next = reencrypt(sealed, row.owner_id, env)
      if (!apply) continue
      const { error } = await store.update(row, next)
      if (error) throw new Error(error.message)
      stats.rotated++
    } catch (e) {
      // Tylko typ błędu i konto - komunikat może pochodzić z bazy, nie z materiału sekretu.
      stats.errors++
      console.error(`  konto ${row.owner_id}: ${e instanceof Error ? e.name : 'błąd'}`)
    }
  }
  return stats
}

function supabaseStore(supabase) {
  return {
    async list() {
      const { data, error } = await supabase.from('google_credentials').select('owner_id, refresh_token_ct, iv, key_version')
      if (error) throw new Error(`google_credentials: ${error.message}`)
      return data ?? []
    },
    async update(row, next) {
      const { data, error } = await supabase
        .from('google_credentials')
        .update({
          refresh_token_ct: toPgBytea(next.ct),
          iv: toPgBytea(next.iv),
          key_version: next.keyVersion,
          rotated_at: new Date().toISOString(),
        })
        .eq('owner_id', row.owner_id)
        .eq('key_version', row.key_version)
        .select('owner_id')
      if (error) return { error }
      // Wiersz zmienił się w międzyczasie (inny przebieg): nie liczymy go jako przeszyfrowanego.
      return data?.length === 1 ? { error: null } : { error: { message: 'wiersz zmieniony w międzyczasie' } }
    },
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const envFile = argValue(process.argv, 'env-file') ?? '.env.e2e'
  const allowRef = argValue(process.argv, 'allow-ref')
  loadEnvFile(path.resolve(process.cwd(), envFile))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (uzupełnij ${envFile}).`)
  if (!checkProjectRef(url, [PREVIEW_REF, allowRef])) {
    console.error(`ODMOWA: host projektu to nie preview (${PREVIEW_REF}) ani ref z --allow-ref. Inny projekt wymaga jawnego --allow-ref=<ref>.`)
    process.exit(2)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} | projekt ${new URL(url).hostname}`)
  const stats = await rotateAll(supabaseStore(supabase), { apply })
  console.log(
    `razem: ${stats.total} | do rotacji: ${stats.toRotate} | przeszyfrowane: ${stats.rotated} | błędy: ${stats.errors}`,
  )
  if (stats.errors > 0) process.exit(1)
  console.log(apply ? 'OK.' : 'Dry-run zakończony (nic nie zapisano). Dodaj --apply, by przeszyfrować.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
