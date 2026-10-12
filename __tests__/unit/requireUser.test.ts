import { describe, test, expect, vi } from 'vitest'

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ marker: 'session-client', auth: { getUser } }) }))

const { requireUser, getUserClient } = await vi.importActual<typeof import('@/lib/auth-guard')>('@/lib/auth-guard')

describe('requireUser', () => {
  test('błąd weryfikacji -> Unauthorized', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid JWT') })
    await expect(requireUser()).rejects.toThrow('Unauthorized')
  })

  test('brak użytkownika -> Unauthorized', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(requireUser()).rejects.toThrow('Unauthorized')
  })

  test('zweryfikowany użytkownik -> { user }', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    expect(await requireUser()).toEqual({ user: { id: 'u1' } })
  })

  test('getUserClient: brak użytkownika -> Unauthorized', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getUserClient()).rejects.toThrow('Unauthorized')
  })

  test('getUserClient: użytkownik -> { user, supabase } (klient z sesją)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await getUserClient()
    expect(res.user).toEqual({ id: 'u1' })
    expect((res.supabase as unknown as { marker: string }).marker).toBe('session-client')
  })
})
