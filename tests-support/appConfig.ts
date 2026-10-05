import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll } from 'vitest'
import type { Database } from '@/types/supabase'
import { createTestDbClient, type Db } from './db'

// `app_config` to jeden, WSPÓŁDZIELONY wiersz (id = 1) całej bazy preview
// (adres admina, ignorowane konta, flagi...). Testy, które muszą go zmienić,
// robią to tylko na czas testu i zawsze przywracają oryginał. Migawka
// oryginalnych wartości ląduje najpierw w pliku - gdyby proces padł w trakcie,
// global-setup kolejnego przebiegu przywróci konfigurację z tego pliku.

type AppConfigRow = Database['public']['Tables']['app_config']['Row']
export type AppConfigPatch = Partial<Omit<AppConfigRow, 'id'>>

const SNAPSHOT_FILE = path.join(os.tmpdir(), 'bmt-integration-app-config-snapshot.json')

export async function applyAppConfig(db: Db, patch: AppConfigPatch): Promise<() => Promise<void>> {
  const keys = Object.keys(patch) as (keyof AppConfigPatch)[]
  const { data: before, error } = await db.from('app_config').select(keys.join(',')).eq('id', 1).single()
  if (error || !before) throw new Error(`Nie udało się odczytać app_config: ${error?.message}`)

  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(before))
  const { error: updateError } = await db.from('app_config').update(patch).eq('id', 1)
  if (updateError) throw new Error(`Nie udało się zmienić app_config: ${updateError.message}`)

  return async () => {
    const { error: restoreError } = await db.from('app_config').update(before as AppConfigPatch).eq('id', 1)
    if (restoreError) throw new Error(`Nie udało się PRZYWRÓCIĆ app_config: ${restoreError.message}`)
    fs.rmSync(SNAPSHOT_FILE, { force: true })
  }
}

/** Przywraca app_config z migawki zostawionej przez przerwany przebieg (jeśli taka jest). */
export async function restoreLeftoverAppConfig(db: Db): Promise<boolean> {
  if (!fs.existsSync(SNAPSHOT_FILE)) return false
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')) as AppConfigPatch
  const { error } = await db.from('app_config').update(snapshot).eq('id', 1)
  if (error) throw new Error(`Nie udało się przywrócić app_config z migawki: ${error.message}`)
  fs.rmSync(SNAPSHOT_FILE, { force: true })
  return true
}

/** Ustawia podane pola app_config na czas całego bloku `describe` i przywraca je po nim. */
export function patchAppConfigForSuite(patch: AppConfigPatch) {
  let restore: (() => Promise<void>) | undefined
  beforeAll(async () => {
    restore = await applyAppConfig(createTestDbClient(), patch)
  })
  afterAll(async () => {
    await restore?.()
  })
}
