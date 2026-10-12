import { describe, test, expect, vi, beforeEach } from 'vitest'

const single = vi.fn()
const maybeSingle = vi.fn()
const eq = vi.fn()
const update = vi.fn()
const select = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from }),
}))

import {
  readAppConfig,
  readAppConfigRow,
  updateAppConfig,
  readSystemSettings,
  updateSystemSettings,
  getLegacyOwnerId,
} from '@/lib/app-config'

beforeEach(() => {
  vi.clearAllMocks()
  // select(...).eq(k,v).single()/maybeSingle()  oraz  update(...).eq(k,v).select().single()
  from.mockReturnValue({ select, update })
  select.mockReturnValue({ eq, single, maybeSingle })
  update.mockReturnValue({ eq })
  eq.mockReturnValue({ single, maybeSingle, select })
})

describe('lib/app-config - per konto', () => {
  test('updateAppConfig zawęża do owner_id i zwraca zaktualizowany wiersz', async () => {
    single.mockResolvedValue({ data: { owner_id: 'o1', admin_email: 'a@b.pl' }, error: null })
    const row = await updateAppConfig('o1', { admin_email: 'a@b.pl' })
    expect(from).toHaveBeenCalledWith('app_config')
    expect(update).toHaveBeenCalledWith({ admin_email: 'a@b.pl' })
    expect(eq).toHaveBeenCalledWith('owner_id', 'o1')
    expect(row).toEqual({ owner_id: 'o1', admin_email: 'a@b.pl' })
  })

  test('updateAppConfig rzuca błąd z bazy', async () => {
    const err = { message: 'boom' }
    single.mockResolvedValue({ data: null, error: err })
    await expect(updateAppConfig('o1', { admin_email: 'x' })).rejects.toBe(err)
  })

  test('readAppConfig / readAppConfigRow: filtr owner_id, brak wiersza -> null', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { admin_email: 'a@b.pl' }, error: null })
    expect(await readAppConfig('o2', ['admin_email'])).toEqual({ admin_email: 'a@b.pl' })
    expect(select).toHaveBeenCalledWith('admin_email')
    expect(eq).toHaveBeenCalledWith('owner_id', 'o2')
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect(await readAppConfigRow('o3')).toBeNull()
    expect(eq).toHaveBeenLastCalledWith('owner_id', 'o3')
  })
})

describe('lib/app-config - system_settings i legacy owner', () => {
  test('readSystemSettings / updateSystemSettings pracują na system_settings id = 1', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 1, time_offset_ms: 7, allow_destructive_test_deletes: false }, error: null })
    expect((await readSystemSettings())?.time_offset_ms).toBe(7)
    expect(from).toHaveBeenLastCalledWith('system_settings')
    single.mockResolvedValue({ data: { id: 1, time_offset_ms: 9, allow_destructive_test_deletes: false }, error: null })
    await updateSystemSettings({ time_offset_ms: 9 })
    expect(update).toHaveBeenCalledWith({ time_offset_ms: 9 })
    expect(eq).toHaveBeenLastCalledWith('id', 1)
  })

  test('getLegacyOwnerId czyta legacy_owner', async () => {
    single.mockResolvedValue({ data: { owner_id: 'legacy-1' }, error: null })
    expect(await getLegacyOwnerId()).toBe('legacy-1')
    expect(from).toHaveBeenLastCalledWith('legacy_owner')
    single.mockResolvedValue({ data: null, error: { message: 'x' } })
    await expect(getLegacyOwnerId()).rejects.toThrow()
  })
})
