import { beforeEach, describe, expect, test, vi } from 'vitest'

// Testujemy same handlery tras: uwierzytelnianie, nadpisania miesiąca/roku i
// mapowanie źródła. Logika pod spodem (czynsze, przypomnienia) ma własne testy,
// a jej odpalenie zapisałoby należności / wysłało przypomnienia dla WSZYSTKICH
// prawdziwych umów i najemców w bazie preview - dlatego jest tu zamockowana.
const generateRents = vi.hoisted(() => vi.fn())
const processStatementUploadReminder = vi.hoisted(() => vi.fn())
const processMeterReadingReminder = vi.hoisted(() => vi.fn())

vi.mock('@/lib/rents', () => ({ generateRents }))
vi.mock('@/lib/statement-reminder', () => ({ processStatementUploadReminder }))
vi.mock('@/lib/meter-reading-reminder', () => ({ processMeterReadingReminder }))
// Stały "teraz": 16 września 2026 (czas wirtualny z lib/clock.ts jest osobno testowany).
vi.mock('@/lib/clock', () => ({ getCurrentDate: async () => new Date(2026, 8, 16, 8, 0, 0) }))

const generateRentsRoute = await import('@/app/api/cron/generate-rents/route')
const statementReminderRoute = await import('@/app/api/cron/statement-reminder/route')
const meterReadingRoute = await import('@/app/api/cron/meter-reading-reminder/route')

const SECRET = process.env.CRON_SECRET!

function request(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://bmt.test${path}`, { headers })
}
const bearer = (secret = SECRET) => ({ authorization: `Bearer ${secret}` })
const vercelCron = { 'x-vercel-cron': '1' }

beforeEach(() => {
  generateRents.mockReset().mockResolvedValue({ results: [{}, {}], skippedCount: 3 })
  processStatementUploadReminder.mockReset().mockResolvedValue({ sent: true })
  processMeterReadingReminder.mockReset().mockResolvedValue({ sent: 4 })
})

describe('GET /api/cron/generate-rents', () => {
  const GET = generateRentsRoute.GET

  describe('tryb produkcyjny (NODE_ENV=production)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_ALLOW_TEST_PANEL', '')
    })

    test('bez sekretu i nagłówka crona -> 401 i nic nie generuje', async () => {
      const res = await GET(request('/api/cron/generate-rents'))

      expect(res.status).toBe(401)
      expect(generateRents).not.toHaveBeenCalled()
    })

    test('błędny sekret -> 401', async () => {
      const res = await GET(request('/api/cron/generate-rents', bearer('zly-sekret')))

      expect(res.status).toBe(401)
      expect(generateRents).not.toHaveBeenCalled()
    })

    test('prawdziwy Vercel Cron -> źródło CRON, bieżący miesiąc z zegara', async () => {
      const res = await GET(request('/api/cron/generate-rents', vercelCron))

      expect(res.status).toBe(200)
      expect(generateRents).toHaveBeenCalledWith(9, 2026, 'CRON')
      expect(await res.json()).toEqual({ success: true, generated: 2, skipped: 3, month: 9, year: 2026, source: 'CRON', simulated: false })
    })

    test('wywołanie ręczne z sekretem -> źródło MANUAL', async () => {
      const res = await GET(request('/api/cron/generate-rents', bearer()))

      expect(res.status).toBe(200)
      expect(generateRents).toHaveBeenCalledWith(9, 2026, 'MANUAL')
    })

    test('nadpisanie month/year jest ignorowane na produkcji, nawet z poprawnym sekretem', async () => {
      const res = await GET(request('/api/cron/generate-rents?month=2&year=2020', bearer()))

      expect(generateRents).toHaveBeenCalledWith(9, 2026, 'MANUAL')
      expect(await res.json()).toMatchObject({ month: 9, year: 2026, simulated: false })
    })

    test('włączony panel testowy (NEXT_PUBLIC_ALLOW_TEST_PANEL) wyłącza uwierzytelnianie i pozwala na nadpisanie', async () => {
      vi.stubEnv('NEXT_PUBLIC_ALLOW_TEST_PANEL', 'true')

      const res = await GET(request('/api/cron/generate-rents?month=2&year=2020'))

      expect(res.status).toBe(200)
      expect(generateRents).toHaveBeenCalledWith(2, 2020, 'TEST_MANUAL')
    })
  })

  describe('poza produkcją (dev/preview z panelem testowym)', () => {
    test('nie wymaga sekretu, źródło TEST_MANUAL, bieżący miesiąc z zegara', async () => {
      const res = await GET(request('/api/cron/generate-rents'))

      expect(res.status).toBe(200)
      expect(generateRents).toHaveBeenCalledWith(9, 2026, 'TEST_MANUAL')
      expect(await res.json()).toMatchObject({ source: 'TEST_MANUAL', simulated: false })
    })

    test('nadpisanie month/year (symulacja) jest respektowane i oznaczone jako simulated', async () => {
      const res = await GET(request('/api/cron/generate-rents?month=2&year=2020'))

      expect(generateRents).toHaveBeenCalledWith(2, 2020, 'TEST_MANUAL')
      expect(await res.json()).toMatchObject({ month: 2, year: 2020, simulated: true })
    })

    test('samo month bez year nie nadpisuje daty', async () => {
      await GET(request('/api/cron/generate-rents?month=2'))

      expect(generateRents).toHaveBeenCalledWith(9, 2026, 'TEST_MANUAL')
    })

    test('prawdziwy cron ma pierwszeństwo: źródło CRON', async () => {
      await GET(request('/api/cron/generate-rents', vercelCron))

      expect(generateRents).toHaveBeenCalledWith(9, 2026, 'CRON')
    })
  })

  test('błąd generowania -> 500 z komunikatem', async () => {
    generateRents.mockRejectedValue(new Error('baza nie odpowiada'))

    const res = await GET(request('/api/cron/generate-rents'))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'baza nie odpowiada' })
  })
})

describe.each([
  ['statement-reminder', statementReminderRoute.GET, processStatementUploadReminder, { sent: true }],
  ['meter-reading-reminder', meterReadingRoute.GET, processMeterReadingReminder, { sent: 4 }],
])('GET /api/cron/%s', (name, GET, job, payload) => {
  const path = `/api/cron/${name}`

  test('bez poświadczeń -> 401 i przypomnienie nie rusza', async () => {
    const res = await GET(request(path))

    expect(res.status).toBe(401)
    expect(job).not.toHaveBeenCalled()
  })

  test('błędny sekret -> 401', async () => {
    const res = await GET(request(path, bearer('zly-sekret')))

    expect(res.status).toBe(401)
    expect(job).not.toHaveBeenCalled()
  })

  test('poprawny sekret -> 200 z wynikiem zadania', async () => {
    const res = await GET(request(path, bearer()))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, ...payload })
    expect(job).toHaveBeenCalledTimes(1)
  })

  test('nagłówek Vercel Cron -> 200', async () => {
    const res = await GET(request(path, vercelCron))

    expect(res.status).toBe(200)
    expect(job).toHaveBeenCalledTimes(1)
  })

  test('błąd zadania -> 500 z komunikatem', async () => {
    job.mockRejectedValue(new Error('SMTP padł'))

    const res = await GET(request(path, bearer()))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'SMTP padł' })
  })

  // ZNANA LUKA: gdy CRON_SECRET nie jest ustawiony, porównanie idzie z tekstem
  // "Bearer undefined", więc nagłówek `Authorization: Bearer undefined` przechodzi
  // uwierzytelnienie. `test.fails` - ten test zacznie "failować", gdy luka zostanie
  // załatana (brak sekretu powinien odrzucać każde wywołanie bez nagłówka crona).
  test.fails('niezdefiniowany CRON_SECRET nie wpuszcza nagłówka "Bearer undefined"', async () => {
    vi.stubEnv('CRON_SECRET', '') // zapamiętuje oryginał do przywrócenia w afterEach
    delete process.env.CRON_SECRET

    const res = await GET(request(path, { authorization: 'Bearer undefined' }))

    expect(res.status).toBe(401)
  })
})
