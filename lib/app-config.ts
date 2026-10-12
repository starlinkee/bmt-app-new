import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/supabase'

type AppConfigRow = Database['public']['Tables']['app_config']['Row']

/**
 * Jedyny dozwolony odczyt app_config rolą service_role do slice 3 (konfiguracja
 * per konto). Tabela ma politykę tylko dla service_role, więc klient z sesją
 * zwraca 0 wierszy. Tylko odczyt, tylko wskazane kolumny; zapisy idą przez ustawienia.
 */
export async function readAppConfig<K extends keyof AppConfigRow>(columns: K[]): Promise<Pick<AppConfigRow, K> | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('app_config').select(columns.join(',')).eq('id', 1).single()
  return (data as unknown as Pick<AppConfigRow, K> | null) ?? null
}
