import { describe, expect, test, vi, afterEach } from 'vitest'
import { GmailSendError, buildMime, encodeHeaderText, sendGmail } from '../../lib/gmail'

const decode = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

afterEach(() => vi.unstubAllGlobals())

describe('buildMime', () => {
  test('From, To (wiele adresów), temat z polskimi znakami jako RFC 2047 i html w base64', () => {
    const raw = buildMime({ from: 'konto@gmail.example', to: ['a@example.com', 'b@example.com'], subject: 'Rozliczenie źółć', html: '<p>Zażółć</p>' })
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/) // base64url: bez +, / i =
    const mime = decode(raw)
    expect(mime).toContain('From: konto@gmail.example\r\n')
    expect(mime).toContain('To: a@example.com, b@example.com\r\n')
    const subject = /Subject: ((?:=\?UTF-8\?B\?[^?]+\?=\r\n ?)+)/.exec(mime)?.[1] ?? ''
    const words = [...subject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map((m) => Buffer.from(m[1], 'base64').toString('utf8'))
    expect(words.join('')).toBe('Rozliczenie źółć')
    const htmlB64 = /Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/.exec(mime)?.[1].replace(/\r\n/g, '') ?? ''
    expect(Buffer.from(htmlB64, 'base64').toString('utf8')).toBe('<p>Zażółć</p>')
  })

  test('załącznik PDF: nazwa, typ i treść w base64', () => {
    const pdf = Buffer.from('%PDF-1.4 test')
    const mime = decode(buildMime({ from: 'k@gmail.example', to: 'a@example.com', subject: 'x', html: 'y', attachments: [{ filename: 'Wyciąg.pdf', content: pdf }] }))
    expect(mime).toContain('Content-Type: application/pdf; name="=?UTF-8?B?')
    expect(mime).toContain(pdf.toString('base64'))
    expect(mime.trimEnd().endsWith('--')).toBe(true)
  })

  test('odrzuca wstrzyknięcie nagłówka przez CR/LF w adresie lub temacie', () => {
    expect(() => buildMime({ from: 'k@gmail.example', to: 'a@example.com\r\nBcc: x@y.pl', subject: 's', html: 'h' })).toThrow()
    expect(() => encodeHeaderText('a\nBcc: x')).toThrow()
  })

  test('ASCII w temacie zostaje bez kodowania', () => {
    expect(encodeHeaderText('[PREVIEW] Hello')).toBe('[PREVIEW] Hello')
  })
})

describe('sendGmail', () => {
  test('wysyła raw z tokenem w nagłówku i zwraca id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendGmail('tok-A', 'RAW')).resolves.toEqual({ id: 'abc' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-A')
    expect(JSON.parse(String(init.body))).toEqual({ raw: 'RAW' })
  })

  test('401 = reauth, inny błąd = zwykły; komunikat bez tokenu i treści', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED' } }), { status: 401 })))
    const e = await sendGmail('sekretny-token', 'SEKRETNA-TRESC').catch((x) => x)
    expect(e).toBeInstanceOf(GmailSendError)
    expect(e.reauth).toBe(true)
    expect(e.message).not.toMatch(/sekretny|SEKRETNA/)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    const e2 = await sendGmail('t', 'r').catch((x) => x)
    expect(e2.reauth).toBe(false)
    expect(e2.code).toBe('http_500')
  })

  test('błąd sieci -> network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    await expect(sendGmail('t', 'r')).rejects.toMatchObject({ code: 'network', reauth: false })
  })
})
