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
  // Ta sama logika co w lib/auth-guard.ts (select na tenants klientem sesji).
  assertTenantOwned: async (
    supabase: { from: (t: string) => { select: (c: string) => { eq: (k: string, v: number) => { maybeSingle: () => Promise<{ data: unknown }> } } } },
    tenantId: number,
  ) => {
    const { data } = await supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle()
    if (!data) throw new Error('Not found')
  },
}))
