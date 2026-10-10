import { describe, test, expect, vi } from 'vitest'

// getSession() zwraca sesję zdekodowaną z (potencjalnie podrobionego) ciasteczka,
// a getUser() weryfikuje token w Supabase Auth - requireApiAuth musi ufać tylko temu drugiemu.
const getSession = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getSession, getUser } }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { requireApiAuth } = await import('@/lib/auth')

describe('requireApiAuth', () => {
  test('podrobione ciasteczko: getSession ma sesję, getUser zwraca błąd -> null', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'forged' } } })
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid JWT') })
    expect(await requireApiAuth()).toBeNull()
  })

  test('brak użytkownika bez błędu -> null', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await requireApiAuth()).toBeNull()
  })

  test('zweryfikowany użytkownik -> użytkownik', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    expect(await requireApiAuth()).toEqual({ id: 'u1' })
  })
})
