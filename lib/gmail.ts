import 'server-only'

// Granica do Gmail API (users.messages.send): MIME budowany lokalnie, wysyłka cienkim fetchem (jak google-oauth.ts,
// bez googleapis). Błędy niosą wyłącznie kod - nigdy tokenu ani treści wiadomości (raw).

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const TIMEOUT_MS = 20000

export type MimeAttachment = { filename: string; content: Buffer }
export type MimeMessage = {
  from: string
  to: string | string[]
  subject: string
  html: string
  attachments?: MimeAttachment[]
}

/** Błąd wywołania Gmail API; `code` to kod Google (np. invalid_grant), http_<status> albo network. */
export class GmailSendError extends Error {
  readonly code: string
  /** 401 / invalid_grant: token konta nie działa, pomaga tylko ponowne połączenie. */
  readonly reauth: boolean
  constructor(code: string, reauth = false) {
    super(`Gmail API: ${code}`)
    this.name = 'GmailSendError'
    this.code = code
    this.reauth = reauth
  }
}

function assertHeaderValue(value: string, what: string) {
  if (/[\r\n]/.test(value)) throw new Error(`Niepoprawna wartość nagłówka (${what}).`)
}

/** RFC 2047: tekst spoza ASCII jako ciąg encoded-words (base64, do ~45 bajtów, bez dzielenia znaków). */
export function encodeHeaderText(text: string): string {
  assertHeaderValue(text, 'nagłówek')
  if (/^[\x20-\x7e]*$/.test(text)) return text
  const words: string[] = []
  let chunk = ''
  for (const ch of text) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += ch
  }
  if (chunk) words.push(chunk)
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ')
}

function wrapBase64(buf: Buffer): string {
  return (buf.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Wiadomość RFC 5322 (multipart/mixed: html UTF-8 + załączniki) zakodowana base64url jako pole `raw` Gmail API. */
export function buildMime({ from, to, subject, html, attachments = [] }: MimeMessage): string {
  const recipients = Array.isArray(to) ? to : [to]
  for (const a of [from, ...recipients]) assertHeaderValue(a, 'adres')
  const boundary = `bmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const lines: string[] = [
    `From: ${from}`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${encodeHeaderText(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(html, 'utf8')),
  ]
  for (const a of attachments) {
    const name = encodeHeaderText(a.filename).replace(/"/g, "'")
    lines.push(
      `--${boundary}`,
      `Content-Type: ${a.filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'}; name="${name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${name}"`,
      '',
      wrapBase64(a.content),
    )
  }
  lines.push(`--${boundary}--`, '')
  return toBase64Url(Buffer.from(lines.join('\r\n'), 'utf8'))
}

/** Wysyła gotowe `raw` tokenem konta. Zwraca id wiadomości w Gmailu. */
export async function sendGmail(accessToken: string, raw: string): Promise<{ id: string | null }> {
  let res: Response
  try {
    res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new GmailSendError('network')
  }
  const json = (await res.json().catch(() => ({}))) as { id?: unknown; error?: { status?: unknown } | unknown }
  if (res.ok) return { id: typeof json.id === 'string' ? json.id : null }
  const status = (json.error as { status?: unknown } | undefined)?.status
  const code = typeof status === 'string' && /^[A-Z_]{1,40}$/.test(status) ? status.toLowerCase() : `http_${res.status}`
  throw new GmailSendError(code, res.status === 401 || code === 'unauthenticated' || code === 'invalid_grant')
}
