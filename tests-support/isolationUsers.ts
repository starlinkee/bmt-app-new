/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { assertNotProduction } from './guard'

// Dwóch prawdziwych użytkowników testowych (konta A i B) do testów izolacji kont:
// zakładani przez auth.admin (rola service), logują się hasłem klientem z kluczem anon,
// więc zapytania idą dokładnie tą samą ścieżką RLS co zwykła sesja w aplikacji.

export const ISO_USER_PREFIX = 'e2e_test__iso_'
export const ISOLATION_BUCKETS = ['invoices', 'manual-uploads'] as const

// Kolejność: tabele zależne przed rodzicami (owner_id nie ma ON DELETE CASCADE).
const WIPE_ORDER = [
  'google_credentials',
  'google_connections',
  'transaction_amendments',
  'invoices',
  'transaction_staging',
  'transactions',
  'contracts',
  'media_settlements',
  'media_meter_readings',
  'settlement_group_properties',
  'skill_prompts',
  'settlement_groups',
  'tenants',
  'properties',
  'email_logs',
  'reminder_dedup',
  'operation_log',
  'audit_log',
  'app_config',
] as const

export type IsolationUser = {
  id: string
  email: string
  client: SupabaseClient<any>
}

export function serviceClient(opts: { strict?: boolean } = {}): SupabaseClient<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - ustaw je w .env.e2e.')
  // Sprzątanie z e2e (purgeAllTestData) idzie bez PRODUCTION_SUPABASE_REFS, jak createTestDbClient; test izolacji wymaga ich (strict).
  assertNotProduction(undefined, { requireConfigured: !!opts.strict })
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function anonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!key) throw new Error('Brak NEXT_PUBLIC_SUPABASE_ANON_KEY (klucz publiczny preview) - dopisz go do .env.e2e.')
  return key
}

/** Klient bez sesji (rola anon). */
export function anonClient(): SupabaseClient<any> {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function createIsolationUser(admin: SupabaseClient<any>, label: string): Promise<IsolationUser> {
  const uniq = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const email = `${ISO_USER_PREFIX}${label}_${uniq}@bmt.local`
  const password = randomBytes(24).toString('base64url')
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`Nie udało się założyć użytkownika testowego: ${error?.message}`)

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`Logowanie użytkownika testowego nie powiodło się: ${signInError.message}`)
  return { id: data.user.id, email, client }
}

async function listFilesRecursive(admin: SupabaseClient<any>, bucket: string, prefix: string): Promise<string[]> {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
  const paths: string[] = []
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`
    if (entry.id === null) paths.push(...(await listFilesRecursive(admin, bucket, path)))
    else paths.push(path)
  }
  return paths
}

/** Kasuje (rolą service) wszystko, co należy do podanych kont: wiersze, pliki storage, a na końcu użytkowników. */
export async function wipeAndDeleteUsers(admin: SupabaseClient<any>, ownerIds: string[]) {
  if (!ownerIds.length) return
  const problems: string[] = []

  for (const table of WIPE_ORDER) {
    const { error } = await admin.from(table).delete().in('owner_id', ownerIds)
    if (error) problems.push(`${table}: ${error.message}`)
  }
  for (const bucket of ISOLATION_BUCKETS) {
    for (const id of ownerIds) {
      const files = await listFilesRecursive(admin, bucket, id)
      if (files.length) {
        const { error } = await admin.storage.from(bucket).remove(files)
        if (error) problems.push(`storage ${bucket}: ${error.message}`)
      }
    }
  }
  for (const id of ownerIds) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) problems.push(`auth.deleteUser: ${error.message}`)
  }
  if (problems.length) throw new Error(`Sprzątanie użytkowników testowych nie powiodło się: ${problems.join('; ')}`)
}

/** Siatka bezpieczeństwa: usuwa wszystkich użytkowników testowych izolacji (po prefiksie e-maila) razem z ich danymi. */
export async function purgeIsolationUsers(admin: SupabaseClient<any>) {
  const ids: string[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const u of data.users) if (u.email?.toLowerCase().startsWith(ISO_USER_PREFIX)) ids.push(u.id)
    if (data.users.length < 200) break
  }
  await wipeAndDeleteUsers(admin, ids)
  return ids.length
}
