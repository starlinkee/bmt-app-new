import { restoreLeftoverAppConfig } from '../../tests-support/appConfig'
import { countTestLeftovers, createTestDbClient, purgeAllTestData } from '../../tests-support/db'
import { assertNotProduction, supabaseRefFromUrl } from '../../tests-support/guard'

let startedAt = new Date().toISOString()
// Vitest woła teardown także po nieudanym setupie - wtedy nie ma czego sprzątać,
// a drugi błąd zasłoniłby właściwy powód (np. baza nieosiągalna).
let setupCompleted = false

async function assertReachable() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  try {
    await fetch(`${url}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY! },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    const reason = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e)
    throw new Error(
      `Baza preview (${supabaseRefFromUrl(url)}) jest nieosiągalna: ${reason}. ` +
        'Projekty Supabase na darmowym planie są wstrzymywane po tygodniu bez aktywności - ' +
        'sprawdź w panelu Supabase, czy projekt działa, i czy .env.e2e wskazuje na właściwy.',
    )
  }
}

export async function setup() {
  assertNotProduction(undefined, { requireConfigured: true })
  await assertReachable()

  const db = createTestDbClient()
  // Pozostałości po przerwanym przebiegu: konfiguracja i dane testowe.
  if (await restoreLeftoverAppConfig(db)) {
    console.warn('[integration] Przywrócono app_config z migawki przerwanego przebiegu.')
  }
  await purgeAllTestData(db)
  startedAt = new Date().toISOString()
  setupCompleted = true
}

export async function teardown() {
  if (!setupCompleted) return
  const db = createTestDbClient()
  await purgeAllTestData(db, { auditSince: startedAt })

  const dirty = Object.entries(await countTestLeftovers(db)).filter(([, n]) => n > 0)
  if (dirty.length) {
    throw new Error(`Testy integracyjne zostawiły dane w bazie: ${dirty.map(([t, n]) => `${t}=${n}`).join(', ')}`)
  }
}
