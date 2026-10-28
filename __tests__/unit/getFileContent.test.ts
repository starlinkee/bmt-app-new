import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/app-config', () => ({ readAppConfig: vi.fn() }))

const readFile = vi.fn(async () => 'zawartość')
vi.mock('fs/promises', () => {
  const api = { readFile: (...a: unknown[]) => (readFile as (...a: unknown[]) => unknown)(...a), mkdir: vi.fn(), writeFile: vi.fn() }
  return { default: api, ...api }
})

const { getFileContent } = await import('@/app/(dashboard)/import/actions')

beforeEach(() => readFile.mockClear())

describe('getFileContent - path traversal', () => {
  test.each(['../package.json', '..', 'a/../../package.json', '/etc/passwd', 'sub/plik.csv', '..\\x', ''])(
    '%j -> null i brak odczytu z dysku',
    async (name) => {
      expect(await getFileContent(name)).toBeNull()
      expect(readFile).not.toHaveBeenCalled()
    },
  )

  test('zwykła nazwa pliku -> odczyt z data/attachments', async () => {
    expect(await getFileContent('abc_wyciag.csv')).toBe('zawartość')
    expect(readFile).toHaveBeenCalledTimes(1)
    const [p] = readFile.mock.calls[0] as unknown as [string]
    expect(p.replace(/\\/g, '/')).toMatch(/\/data\/attachments\/abc_wyciag\.csv$/)
  })
})
