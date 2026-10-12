import { vi } from 'vitest'

// Testy jednostkowe wołają server actions bez żądania HTTP - requireUser()
// (sesja z ciasteczka) podmieniamy na zalogowanego użytkownika. getUserClient()
// zwraca użytkownika i klienta z globalThis.__unitSessionClient (test ustawia go
// na swój fałszywy klient; domyślnie brak klienta). Test samego strażnika
// (requireUser.test.ts) używa vi.importActual.
vi.mock('@/lib/auth-guard', () => ({
  requireUser: async () => ({ user: { id: 'unit-test-user' } }),
  getUserClient: async () => ({
    user: { id: 'unit-test-user' },
    supabase: (globalThis as { __unitSessionClient?: unknown }).__unitSessionClient,
  }),
}))
