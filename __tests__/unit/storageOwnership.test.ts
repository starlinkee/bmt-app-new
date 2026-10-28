import { describe, test, expect, vi, beforeEach } from 'vitest'

// Konto B nie dostaje pliku konta A: trasy i akcje podpisują / kasują tylko ścieżki pod prefiksem
// zalogowanego konta (klucz service omija polityki storage, więc sprawdzenie jest po stronie kodu).
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const state = { userId: A, legacyOwner: A }
const calls = { signed: [] as string[], removed: [] as string[][], uploaded: [] as string[], listed: [] as string[] }

vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`) } }))
vi.mock('@/lib/auth', () => ({
  requireAuth: async () => ({ id: state.userId }),
  requireApiAuth: async () => ({ id: state.userId }),
}))
vi.mock('@/lib/auth-guard', () => ({ requireUser: async () => ({ user: { id: state.userId } }) }))
vi.mock('@/lib/audit', () => ({ logAudit: async () => undefined }))
vi.mock('@/lib/app-config', () => ({ getLegacyOwnerId: async () => state.legacyOwner }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async (p: string) => (calls.signed.push(p), { data: { signedUrl: `https://signed/${p}` }, error: null }),
        createSignedUploadUrl: async (p: string) => (calls.uploaded.push(p), { data: { token: 't' }, error: null }),
        upload: async (p: string) => (calls.uploaded.push(p), { error: null }),
        remove: async (paths: string[]) => (calls.removed.push(paths), { error: null }),
        list: async (p: string) => (calls.listed.push(p), { data: p.endsWith('/x') ? [{ id: 'f', name: 'a.pdf' }] : [], error: null }),
      }),
    },
  }),
}))

import { GET as getPdf } from '@/app/api/media-settlement-pdf/[...path]/route'
import { GET as getAttachment } from '@/app/api/attachments/[filename]/route'
import { GET as getSkillFiles } from '@/app/api/skill-files/route'
import { getUploadFileUrl, deleteUploadFolder, prepareUpload, getUploads } from '@/app/(dashboard)/rozlicz-media/uploads-actions'

const req = (url: string) => Object.assign(new Request(url), { nextUrl: new URL(url) }) as never

beforeEach(() => {
  state.userId = A
  state.legacyOwner = A
  calls.signed = []
  calls.removed = []
  calls.uploaded = []
  calls.listed = []
  vi.unstubAllEnvs()
})

describe('GET /api/media-settlement-pdf', () => {
  const pathA = `${A}/PREVIEW/2026/1/grupa/nota.pdf`
  const params = (p: string) => ({ params: Promise.resolve({ path: p.split('/') }) })

  test('właściciel dostaje redirect do podpisanego URL', async () => {
    const res = await getPdf(req('http://x'), params(pathA))
    expect(res.status).toBe(307)
    expect(calls.signed).toEqual([pathA])
  })

  test('konto B prosi o ścieżkę konta A -> 404 i brak podpisu', async () => {
    state.userId = B
    const res = await getPdf(req('http://x'), params(pathA))
    expect(res.status).toBe(404)
    expect(calls.signed).toEqual([])
  })

  test('stara ścieżka bez prefiksu -> 404 bez podpisu', async () => {
    const res = await getPdf(req('http://x'), params('PREVIEW/2026/1/grupa/nota.pdf'))
    expect(res.status).toBe(404)
    expect(calls.signed).toEqual([])
  })
})

describe('GET /api/attachments/[filename]', () => {
  const params = { params: Promise.resolve({ filename: 'uuid_faktura.pdf' }) }

  test('podpisuje ścieżkę pod prefiksem zalogowanego konta (prod i preview)', async () => {
    await getAttachment(req('http://x/api/attachments/uuid_faktura.pdf'), params)
    vi.stubEnv('VERCEL_ENV', 'preview')
    await getAttachment(req('http://x/api/attachments/uuid_faktura.pdf'), params)
    expect(calls.signed).toEqual([`${A}/emails/uuid_faktura.pdf`, `${A}/preview/emails/uuid_faktura.pdf`])
  })

  test('konto B nigdy nie podpisuje ścieżki pod prefiksem A', async () => {
    state.userId = B
    await getAttachment(req('http://x/api/attachments/uuid_faktura.pdf'), params)
    expect(calls.signed).toEqual([`${B}/emails/uuid_faktura.pdf`])
    expect(calls.signed.some((p) => p.startsWith(A))).toBe(false)
  })

  test('nazwa z ukośnikiem / .. -> 400 bez podpisu', async () => {
    for (const filename of ['../x', 'a/b']) {
      const res = await getAttachment(req('http://x'), { params: Promise.resolve({ filename }) })
      expect(res.status).toBe(400)
    }
    expect(calls.signed).toEqual([])
  })
})

describe('GET /api/skill-files (ai-files tylko dla właściciela legacy)', () => {
  test('konto B: browse -> pusta lista, plik -> 404, bez dotykania storage', async () => {
    state.userId = B
    const browse = await getSkillFiles(req('http://x/api/skill-files?browse=1'))
    expect(await browse.json()).toEqual({ skills: [] })
    const file = await getSkillFiles(req('http://x/api/skill-files?path=skill/job/plik.pdf'))
    expect(file.status).toBe(404)
    const job = await getSkillFiles(req('http://x/api/skill-files?jobId=j&file=plik.pdf'))
    expect(job.status).toBe(404)
    expect(calls.signed).toEqual([])
    expect(calls.listed).toEqual([])
  })

  test('właściciel legacy: plik wydany', async () => {
    const res = await getSkillFiles(req('http://x/api/skill-files?path=skill/job/plik.pdf'))
    expect(res.status).toBe(307)
    expect(calls.signed).toEqual(['ai-files/skill/job/plik.pdf'])
  })
})

describe('akcje ręcznych wgrań (manual-uploads)', () => {
  test('getUploadFileUrl: ścieżka zawsze pod user.id; B nie sięgnie do A', async () => {
    await getUploadFileUrl('lokal', '2026-01-01_10-00-00', 'a.pdf')
    state.userId = B
    await getUploadFileUrl('lokal', '2026-01-01_10-00-00', 'a.pdf')
    expect(calls.signed).toEqual([`${A}/lokal/2026-01-01_10-00-00/a.pdf`, `${B}/lokal/2026-01-01_10-00-00/a.pdf`])
  })

  test('getUploadFileUrl: próba traversal przez nazwę pliku -> throw, brak podpisu', async () => {
    state.userId = B
    await expect(getUploadFileUrl('lokal', 'p', '..')).rejects.toThrow()
    await expect(getUploadFileUrl('..', 'p', 'a.pdf')).rejects.toThrow()
    expect(calls.signed).toEqual([])
  })

  test('deleteUploadFolder: kasuje tylko obiekty z własnego prefiksu', async () => {
    state.userId = B
    await deleteUploadFolder('x')
    expect(calls.listed).toEqual([`${B}/x`])
    expect(calls.removed).toEqual([[`${B}/x/a.pdf`]])
  })

  test('prepareUpload: wszystkie ścieżki uploadu pod user.id', async () => {
    state.userId = B
    const { targets } = await prepareUpload('lokal', ['a.pdf', 'b.pdf'])
    expect(targets.every((t) => t.path.startsWith(`${B}/lokal/`))).toBe(true)
  })

  test('getUploads: listuje od prefiksu konta, nie od korzenia', async () => {
    state.userId = B
    await getUploads()
    expect(calls.listed[0]).toBe(B)
  })
})
