import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Klient service_role wskazujący na bazę Supabase środowiska preview —
 * używany WYŁĄCZNIE do zakładania i sprzątania danych testowych z poziomu
 * testów (poza UI), żeby nie zależeć od kolejności innych scenariuszy.
 */
export function createTestDbClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY dla preview — ustaw je w .env.e2e.',
    )
  }
  return createClient<Database>(url, key)
}

// Prefiks pozwalający jednoznacznie rozpoznać (i w razie czego posprzątać ręcznie)
// rekordy założone przez testy e2e, żeby nigdy nie pomylić ich z prawdziwymi danymi.
export const E2E_PREFIX = 'E2E_TEST__'
