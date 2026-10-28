import { describe, test, expect, vi, beforeEach } from 'vitest'

// Trasy API danych: bez sesji -> 401; z sesją -> zapytania idą klientem z kontekstu
// (getApiUserClient), nie klientem service role.
const ctxRef: { value: unknown } = { value: null }
vi.mock('@/lib/auth-guard', () => ({ getApiUserClient: async () => ctxRef.value }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    throw new Error('trasa nie może używać klienta service role')
  },
}))

import { GET as getSkills } from '@/app/api/skills/route'
import { GET as getPrompt, PUT as putPrompt, DELETE as deletePrompt } from '@/app/api/skill-prompts/route'
import { POST as saveReadings } from '@/app/api/media/save-readings/route'

function req(url: string, init?: RequestInit) {
  const r = new Request(url, init)
  return Object.assign(r, { nextUrl: new URL(url) }) as never
}

function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: string[] = []
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'order', 'eq', 'upsert', 'delete']
  for (const m of methods) chain[m] = (...a: unknown[]) => (calls.push(`${m}:${JSON.stringify(a)}`), chain)
  chain.single = async () => result
  chain.maybeSingle = async () => result
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return { calls, client: { from: (t: string) => (calls.push(`from:${t}`), chain) } }
}

beforeEach(() => {
  ctxRef.value = null
})

describe('trasy API bez sesji -> 401', () => {
  test.each([
    ['GET /api/skills', () => getSkills()],
    ['GET /api/skill-prompts', () => getPrompt(req('http://x/api/skill-prompts?skillId=a'))],
    ['PUT /api/skill-prompts', () => putPrompt(req('http://x/api/skill-prompts', { method: 'PUT', body: '{}' }))],
    ['DELETE /api/skill-prompts', () => deletePrompt(req('http://x/api/skill-prompts?skillId=a', { method: 'DELETE' }))],
    ['POST /api/media/save-readings', () => saveReadings(new Request('http://x', { method: 'POST', body: '{}' }))],
  ])('%s', async (_n, call) => {
    const res = await call()
    expect(res.status).toBe(401)
  })
})

describe('trasy API z sesją używają klienta z kontekstu', () => {
  test('GET /api/skills', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'a', label: 'A', description: '', timeout_ms: 1, settlement_group_id: null }], error: null })
    ctxRef.value = { user: { id: 'u1' }, supabase: client }
    const res = await getSkills()
    expect(res.status).toBe(200)
    expect(calls).toContain('from:skill_prompts')
  })

  test('PUT /api/skill-prompts: upsert z owner_id sesji i onConflict owner_id,id', async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    ctxRef.value = { user: { id: 'u1' }, supabase: client }
    const res = await putPrompt(req('http://x/api/skill-prompts', { method: 'PUT', body: JSON.stringify({ skillId: 'a', content: 'c' }) }))
    expect(res.status).toBe(200)
    const upsert = calls.find((c) => c.startsWith('upsert:'))
    expect(upsert).toContain('"owner_id":"u1"')
    expect(upsert).toContain('"onConflict":"owner_id,id"')
  })

  test('POST save-readings: obca grupa (RLS nie zwraca wiersza) -> 404, bez zapisu', async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    ctxRef.value = { user: { id: 'u1' }, supabase: client }
    const res = await saveReadings(new Request('http://x', { method: 'POST', body: JSON.stringify({ group_id: 9, month: 1, year: 2026, readings: [{ key: 'k', value: 1 }] }) }))
    expect(res.status).toBe(404)
    expect(calls.some((c) => c.startsWith('upsert:'))).toBe(false)
  })
})
