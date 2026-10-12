import { describe, test, expect, vi, beforeEach } from 'vitest'

const single = vi.fn()
const eq = vi.fn()
const update = vi.fn()
const select = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({ select, update }),
  }),
}))

import { readAppConfig, readAppConfigRow, updateAppConfig } from '@/lib/app-config'

beforeEach(() => {
  vi.clearAllMocks()
  // select(...).eq('id',1).single()  oraz  update(...).eq('id',1).select().single()
  select.mockReturnValue({ eq, single })
  update.mockReturnValue({ eq })
  eq.mockReturnValue({ single, select })
})

describe('lib/app-config', () => {
  test('updateAppConfig aktualizuje wiersz id=1 i zwraca zaktualizowany wiersz', async () => {
    single.mockResolvedValue({ data: { id: 1, time_offset_ms: 5 }, error: null })
    const row = await updateAppConfig({ time_offset_ms: 5 })
    expect(update).toHaveBeenCalledWith({ time_offset_ms: 5 })
    expect(eq).toHaveBeenCalledWith('id', 1)
    expect(row).toEqual({ id: 1, time_offset_ms: 5 })
  })

  test('updateAppConfig rzuca błąd z bazy', async () => {
    const err = { message: 'boom' }
    single.mockResolvedValue({ data: null, error: err })
    await expect(updateAppConfig({ time_offset_ms: 1 })).rejects.toBe(err)
  })

  test('readAppConfig zwraca wybrane kolumny, a przy braku wiersza null', async () => {
    single.mockResolvedValueOnce({ data: { admin_email: 'a@b.pl' }, error: null })
    expect(await readAppConfig(['admin_email'])).toEqual({ admin_email: 'a@b.pl' })
    expect(select).toHaveBeenCalledWith('admin_email')
    single.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    expect(await readAppConfigRow()).toBeNull()
  })
})
