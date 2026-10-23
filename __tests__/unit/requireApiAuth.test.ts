import { describe, test, expect, vi } from 'vitest'

// getSession() zwraca sesję zdekodowaną z (potencjalnie podrobionego) ciasteczka,
// a getClaims() weryfikuje podpis i ważność JWT - requireApiAuth musi ufać tylko temu drugiemu.
vi.unmock('@/lib/auth-guard')
const getSession = vi.fn()
const getClaims = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getSession, getClaims } }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { requireApiAuth } = await import('@/lib/auth')

describe('requireApiAuth', () => {
  test('podrobione ciasteczko: getSession ma sesję, getClaims zwraca błąd -> null', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'forged' } } })
    getClaims.mockResolvedValue({ data: null, error: new Error('invalid JWT') })
    expect(await requireApiAuth()).toBeNull()
  })

  test('brak claims bez błędu -> null', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    expect(await requireApiAuth()).toBeNull()
  })

  test('claims bez sub -> null', async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null })
    expect(await requireApiAuth()).toBeNull()
  })

  test('zweryfikowany użytkownik -> { id, email }', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', email: 'a@example.invalid' } }, error: null })
    expect(await requireApiAuth()).toEqual({ id: 'u1', email: 'a@example.invalid' })
  })
})
