import { describe, test, expect, vi } from 'vitest'

// Trasy API bez sesji muszą odpowiadać 401, zanim dotkną bazy / skill runnera.
const getSession = vi.fn()
vi.mock('@/lib/auth', () => ({ requireApiAuth: () => getSession() }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    throw new Error('baza nie powinna być odpytywana bez sesji')
  },
}))
vi.mock('@/lib/skill-runner-client', () => ({
  getVpsUrl: async () => null,
  invalidatePortCache: () => undefined,
  vpsHeaders: () => ({}),
}))

const skills = await import('@/app/api/skills/route')
const skillPrompts = await import('@/app/api/skill-prompts/route')
const runSkill = await import('@/app/api/run-skill/route')
const skillFiles = await import('@/app/api/skill-files/route')
const saveReadings = await import('@/app/api/media/save-readings/route')

const req = (url = 'http://localhost/api/x') => new Request(url, { method: 'POST', body: '{}' }) as never

describe('trasy API bez sesji -> 401', () => {
  test.each([
    ['skills GET', () => skills.GET()],
    ['skill-prompts GET', () => skillPrompts.GET(req('http://localhost/api/skill-prompts?skillId=a') )],
    ['skill-prompts PUT', () => skillPrompts.PUT(req())],
    ['skill-prompts DELETE', () => skillPrompts.DELETE(req())],
    ['run-skill POST', () => runSkill.POST(req())],
    ['run-skill DELETE', () => runSkill.DELETE(req())],
    ['run-skill GET', () => runSkill.GET(req())],
    ['skill-files GET', () => skillFiles.GET(req())],
    ['media/save-readings POST', () => saveReadings.POST(req())],
  ])('%s', async (_name, call) => {
    getSession.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })
})
