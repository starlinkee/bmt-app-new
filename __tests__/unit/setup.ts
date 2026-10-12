import { vi } from 'vitest'

// Testy jednostkowe wołają server actions bez żądania HTTP - requireUser()
// (sesja z ciasteczka) podmieniamy na zalogowanego użytkownika. Test samego
// strażnika (requireUser.test.ts) używa vi.importActual.
vi.mock('@/lib/auth-guard', () => ({ requireUser: async () => ({ user: { id: 'unit-test-user' } }) }))
