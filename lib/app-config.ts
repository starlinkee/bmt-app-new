import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/supabase'

type AppConfigRow = Database['public']['Tables']['app_config']['Row']
type AppConfigUpdate = Database['public']['Tables']['app_config']['Update']
type SystemSettingsRow = Database['public']['Tables']['system_settings']['Row']
type SystemSettingsUpdate = Database['public']['Tables']['system_settings']['Update']

/**
 * Jedyny kanał dostępu do app_config i system_settings rolą service_role w aplikacji.
 * app_config ma jeden wiersz na konto (PK owner_id), więc każde wywołanie podaje ownerId
 * jawnie: z sesji (user.id), z tokenu najemcy (publiczne odczyty) albo - tylko dla cronów
 * i wspólnego nadawcy e-mail - z getLegacyOwnerId(). Wywołujący odpowiada za wcześniejsze
 * uwierzytelnienie (requireUser/getUserClient) - bez sesji wolno wołać tylko z jobów cronów.
 */
export async function readAppConfig<K extends keyof AppConfigRow>(ownerId: string, columns: K[]): Promise<Pick<AppConfigRow, K> | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('app_config').select(columns.join(',')).eq('owner_id', ownerId).maybeSingle()
  return (data as unknown as Pick<AppConfigRow, K> | null) ?? null
}

/** Cały wiersz konfiguracji konta (dla ekranów ustawień i diffu do audytu). */
export async function readAppConfigRow(ownerId: string): Promise<AppConfigRow | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('app_config').select('*').eq('owner_id', ownerId).maybeSingle()
  return data ?? null
}

/** Aktualizacja wiersza konfiguracji konta; zwraca zaktualizowany wiersz, przy błędzie rzuca. */
export async function updateAppConfig(ownerId: string, patch: AppConfigUpdate): Promise<AppConfigRow> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('app_config').update(patch).eq('owner_id', ownerId).select().single()
  if (error) throw error
  return data
}

/** Ustawienia ŚRODOWISKA (zegar testowy, zgoda na niszczące usuwanie) - globalne, nie per konto. */
export async function readSystemSettings(): Promise<SystemSettingsRow | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('system_settings').select('*').eq('id', 1).maybeSingle()
  return data ?? null
}

export async function updateSystemSettings(patch: SystemSettingsUpdate): Promise<SystemSettingsRow> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('system_settings').update(patch).eq('id', 1).select().single()
  if (error) throw error
  return data
}

/** Wszystkie konta (po jednym wierszu app_config) - pętla cronów. Tylko dla jobów bez sesji. */
export async function listOwnerIds(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('app_config').select('owner_id')
  if (error) throw error
  return (data ?? []).map((r) => r.owner_id)
}

/**
 * Właściciel danych sprzed wprowadzenia kont (tabela legacy_owner).
 * @deprecated tylko dla wspólnego nadawcy e-mail (lib/email, do slice 7) i fallbacku bazy
 * (krok 02). Crony iterują po listOwnerIds(). Nie używać w kodzie z sesją.
 */
export async function getLegacyOwnerId(): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('legacy_owner').select('owner_id').eq('id', 1).single()
  if (error || !data) throw new Error('Brak właściciela legacy_owner')
  return data.owner_id
}
