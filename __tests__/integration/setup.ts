import { afterEach, vi } from 'vitest'
import { resetRuntime } from './helpers/runtime'
import { createTestDbClient } from '../../tests-support/db'
import { TEST_SESSION_OWNER_ENV } from '../../tests-support/sessionOwner'

// Konto "sesji" testów: właściciel z legacy_owner (do kroku 05 jedyne konto z danymi i app_config).
// Ustawiane przed testami, żeby fabryki (createTestDbClient) też miały DEFAULT-owner_id.
{
  const { data, error } = await createTestDbClient({ raw: true }).from('legacy_owner').select('owner_id').eq('id', 1).single()
  if (error || !data) throw new Error(`Nie udało się odczytać legacy_owner: ${error?.message}`)
  process.env[TEST_SESSION_OWNER_ENV] = data.owner_id
}

// Ten plik odpala się przed KAŻDYM plikiem testów integracyjnych. Podmienia
// granice zewnętrzne, żeby żaden test nie mógł wysłać prawdziwego maila ani
// wgrać pliku do prawdziwego Storage - nawet przez pomyłkę w pojedynczym teście.

// revalidatePath poza żądaniem Next.js to no-op - nie ciągniemy runtime'u.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// Server actions wołają requireUser() (sesja z ciasteczka) - w testach nie ma
// żądania HTTP, więc podstawiamy zalogowanego użytkownika.
// getUserClient dostaje klienta service (z zawężaniem do danych testowych) owinięty w symulację sesji:
// brakujący owner_id uzupełnia id użytkownika testowego (odpowiednik DEFAULT = auth.uid()).
// Sam createServiceClient zostaje bez uzupełniania - odwzorowuje rolę service (crony, trasy publiczne).
// user.id to uuid konta właściciela (legacy_owner): app_config i owner_id w audycie są per konto,
// a dane testowe należą do właściciela.
vi.mock('@/lib/auth-guard', async () => {
  const testUser = async () => {
    const { getLegacyOwnerId } = await import('@/lib/app-config')
    return { id: await getLegacyOwnerId() }
  }
  return {
  requireUser: async () => ({ user: await testUser() }),
  getUserClient: async () => {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const { withSessionOwner } = await import('../../tests-support/sessionOwner')
    const user = await testUser()
    return { user, supabase: withSessionOwner(createServiceClient(), user.id) }
  },
  getApiUserClient: async () => {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const { withSessionOwner } = await import('../../tests-support/sessionOwner')
    const user = await testUser()
    return { user, supabase: withSessionOwner(createServiceClient(), user.id) }
  },
  // Ta sama logika co w lib/auth-guard.ts (select na tenants klientem "sesji").
  assertTenantOwned: async (
    supabase: { from: (t: string) => { select: (c: string) => { eq: (k: string, v: number) => { maybeSingle: () => Promise<{ data: unknown }> } } } },
    tenantId: number,
  ) => {
    const { data } = await supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle()
    if (!data) throw new Error('Not found')
  },
  }
})

// SMTP: lib/email.ts działa normalnie (szablony, tematy, logi w email_logs),
// ale transport zapisuje wiadomość w `mailbox` zamiast ją wysyłać.
vi.mock('nodemailer', async () => {
  const { mailbox } = await import('./helpers/runtime')
  const createTransport = () => ({
    async sendMail(options: {
      from: string
      to: string | string[]
      subject: string
      html: string
      attachments?: { filename: string; content: Buffer }[]
    }) {
      const mail = { ...options, attachments: options.attachments ?? [] }
      if (mailbox.failWith) throw mailbox.failWith
      if (mailbox.failIf?.(mail)) throw new Error('symulowana awaria SMTP')
      mailbox.sent.push(mail)
      return { messageId: 'integration-test' }
    },
  })
  return { default: { createTransport }, createTransport }
})

// Klient service_role aplikacji: prawdziwa baza preview (z ponowną kontrolą, że
// to nie produkcja), ale Storage podmieniony na atrapę i możliwość zawężania
// zapytań do danych testowych (patrz helpers/runtime.ts).
vi.mock('@/lib/supabase/service', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const { assertNotProduction } = await import('../../tests-support/guard')
  const { createFakeStorage, applyScopes } = await import('./helpers/runtime')
  return {
    createServiceClient: () => {
      assertNotProduction(undefined, { requireConfigured: true })
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      Object.defineProperty(client, 'storage', { value: createFakeStorage() })
      return applyScopes(client)
    },
  }
})

afterEach(() => {
  resetRuntime()
  vi.unstubAllEnvs()
})
