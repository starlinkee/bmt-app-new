import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/supabase'

type AppConfigRow = Database['public']['Tables']['app_config']['Row']
type AppConfigUpdate = Database['public']['Tables']['app_config']['Update']

/**
 * Jedyny kanał dostępu do app_config rolą service_role w aplikacji (odczyt i zapis) do slice 3
 * (konfiguracja per konto): tam te funkcje przepniemy na wiersz konta. Tabela ma politykę tylko dla
 * service_role, więc klient z sesją zwraca 0 wierszy. Wywołujący odpowiada za wcześniejsze
 * uwierzytelnienie (requireUser/getUserClient) - bez sesji wolno wołać tylko z jobów cronów.
 */
export async function readAppConfig<K extends keyof AppConfigRow>(columns: K[]): Promise<Pick<AppConfigRow, K> | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('app_config').select(columns.join(',')).eq('id', 1).single()
  return (data as unknown as Pick<AppConfigRow, K> | null) ?? null
}

/** Cały wiersz konfiguracji (dla ekranów ustawień i diffu do audytu). */
export async function readAppConfigRow(): Promise<AppConfigRow | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('app_config').select('*').eq('id', 1).single()
  return data ?? null
}

/** Aktualizacja wiersza konfiguracji (id = 1); zwraca zaktualizowany wiersz, przy błędzie rzuca. */
export async function updateAppConfig(patch: AppConfigUpdate): Promise<AppConfigRow> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('app_config').update(patch).eq('id', 1).select().single()
  if (error) throw error
  return data
}
