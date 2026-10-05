import { afterEach, vi } from 'vitest'
import { resetRuntime } from './helpers/runtime'

// Ten plik odpala się przed KAŻDYM plikiem testów integracyjnych. Podmienia
// granice zewnętrzne, żeby żaden test nie mógł wysłać prawdziwego maila ani
// wgrać pliku do prawdziwego Storage - nawet przez pomyłkę w pojedynczym teście.

// revalidatePath poza żądaniem Next.js to no-op - nie ciągniemy runtime'u.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

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
