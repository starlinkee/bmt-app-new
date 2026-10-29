import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { formatAmount } from '@/lib/utils'
import {
  DEFAULT_MEDIA_EMAIL_SUBJECT,
  DEFAULT_MEDIA_EMAIL_BODY,
  DEFAULT_STATEMENT_EMAIL_SUBJECT,
  DEFAULT_STATEMENT_EMAIL_BODY,
  DEFAULT_STATEMENT_UPLOAD_REMINDER_SUBJECT,
  DEFAULT_STATEMENT_UPLOAD_REMINDER_BODY,
  DEFAULT_METER_READING_REMINDER_SUBJECT,
  DEFAULT_METER_READING_REMINDER_BODY,
} from '@/lib/email-defaults'
import { getEnvTier } from '@/lib/env'
import crypto from 'crypto'
import { emailAttachmentPath } from '@/lib/storage-paths'
import { GoogleNotConnectedError, GoogleReauthRequiredError, getAccessToken, markNeedsReauth } from '@/lib/google-connection'
import { GmailSendError, buildMime, sendGmail } from '@/lib/gmail'

export const EMAIL_NOT_CONNECTED_MESSAGE = 'Aby wysłać e-mail, połącz Gmaila w Ustawieniach.'
export const EMAIL_REAUTH_MESSAGE = 'Połącz Google ponownie w Ustawieniach.'

/** Komunikat dla użytkownika, gdy wysyłka jest zablokowana brakiem/utratą połączenia z Google; inaczej null. */
export function emailBlockMessage(e: unknown): string | null {
  if (e instanceof GoogleNotConnectedError) return EMAIL_NOT_CONNECTED_MESSAGE
  if (e instanceof GoogleReauthRequiredError) return EMAIL_REAUTH_MESSAGE
  return null
}

// Nadawcą jest połączone konto Google właściciela (google_connections.google_email); admin_email to tylko odbiorca.
async function getSender(ownerId: string): Promise<string> {
  const { data, error } = await createServiceClient()
    .from('google_connections')
    .select('google_email, status')
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) throw new Error(`google_connections: ${error.code ?? 'błąd odczytu'}`)
  if (!data || data.status === 'disconnected' || !data.google_email) throw new GoogleNotConnectedError()
  if (data.status === 'needs_reauth') throw new GoogleReauthRequiredError('needs_reauth')
  return data.google_email
}

/** Te same sprawdzenia co przy wysyłce, bez wysyłania - do blokady akcji przed jakąkolwiek zmianą. */
export async function assertEmailReady(ownerId: string): Promise<void> {
  await getSender(ownerId)
}

// Atrapa tylko dla testów e2e na preview/dev (tam nie ma klucza szyfrującego ani prawdziwego Google): konto
// z adresem Google zaczynającym się od e2e_test__ nie woła Gmail API. Na PRODUCTION nigdy się nie włącza.
export function isE2eMailStub(senderEmail: string): boolean {
  return getEnvTier() !== 'PRODUCTION' && senderEmail.toLowerCase().startsWith('e2e_test__')
}

export const CRON_NOT_CONNECTED = 'google_not_connected'
export const CRON_REAUTH_REQUIRED = 'google_reauth_required'

/** Dla cronów: błąd utraty zgody Google jako stabilny kod (`google_reauth_required`), reszta bez zmian. */
export function toCronError(e: unknown): unknown {
  return e instanceof GoogleReauthRequiredError ? new Error(CRON_REAUTH_REQUIRED) : e
}

/** Bramka crona konta: 'google_not_connected' = pomiń konto, reauth = błąd konta, null = można wysyłać. */
export async function cronEmailGate(ownerId: string): Promise<typeof CRON_NOT_CONNECTED | null> {
  try {
    await assertEmailReady(ownerId)
    return null
  } catch (e) {
    if (e instanceof GoogleNotConnectedError) return CRON_NOT_CONNECTED
    throw toCronError(e)
  }
}

type SendParams = {
  to: string | string[]
  subject: string
  html: string
  attachments?: { filename: string; content: Buffer }[]
  // Konto, w imieniu którego idzie wysyłka (email_logs.owner_id) - jego Gmail jest nadawcą.
  ownerId: string
}

function getEnvSubjectPrefix(): string {
  const tier = getEnvTier()
  if (tier === 'DEVELOPMENT') return '[DEVELOPMENT] '
  if (tier === 'PREVIEW') return '[PREVIEW] '
  return ''
}

async function sendEmail({ to, subject, html, attachments = [], ownerId }: SendParams) {
  const finalTo = to;
  const finalSubject = `${getEnvSubjectPrefix()}${subject}`;
  const finalHtml = html;

  const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';

  const sender = await getSender(ownerId)
  if (!isE2eMailStub(sender)) {
    const accessToken = await getAccessToken(ownerId)
    const raw = buildMime({ from: sender, to: finalTo, subject: finalSubject, html: finalHtml, attachments })
    try {
      await sendGmail(accessToken, raw)
    } catch (e) {
      if (e instanceof GmailSendError && e.reauth) {
        await markNeedsReauth(ownerId, e.code)
        throw new GoogleReauthRequiredError(e.code)
      }
      throw e
    }
  }

  // Wiadomość już wyszła (albo to atrapa e2e) - dopiero teraz archiwum i email_logs.
  try {
    const supabase = createServiceClient()
    const recipientsStr = Array.isArray(finalTo) ? finalTo.join(', ') : finalTo

    const savedAttachments = []
    if (attachments && attachments.length > 0) {
      for (const a of attachments) {
        const uniqueName = crypto.randomUUID() + '_' + a.filename
        const uploadPath = emailAttachmentPath(ownerId, uniqueName, isPreview)

        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(uploadPath, a.content, {
            contentType: a.filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
          })

        if (uploadError) {
          console.error('Storage upload error:', uploadError)
        } else {
          savedAttachments.push({
            name: a.filename,
            path: uniqueName
          })
        }
      }
    }

    await supabase.from('email_logs').insert({
      owner_id: ownerId,
      to_email: recipientsStr,
      subject: finalSubject,
      body: finalHtml,
      attachments: savedAttachments.length > 0 ? savedAttachments : null,
    })
  } catch (e) {
    console.error('Failed to log email', e)
  }
}

function withTypeLabel(subject: string, typeLabel: string, propertyName?: string | null) {
  const prefix = propertyName ? `${propertyName} – ${typeLabel}` : typeLabel
  return `${prefix}: ${subject}`
}

function applyMediaTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

export async function sendMediaEmail(
  ownerId: string,
  to: string | string[],
  tenantName: string,
  invoiceNumber: string,
  amount: number,
  month: number,
  year: number,
  pdfAttachments: { filename: string; buffer: Buffer }[] = [],
  subjectTemplate?: string | null,
  bodyTemplate?: string | null,
  propertyName?: string | null,
) {
  const vars: Record<string, string> = {
    imie: tenantName,
    numer_rachunku: invoiceNumber,
    kwota: formatAmount(amount),
    miesiac: String(month),
    rok: String(year),
  }
  const subject = withTypeLabel(
    applyMediaTemplate(subjectTemplate || DEFAULT_MEDIA_EMAIL_SUBJECT, vars),
    'Media',
    propertyName,
  )
  const bodyText = applyMediaTemplate(bodyTemplate || DEFAULT_MEDIA_EMAIL_BODY, vars)
  const html = bodyText
    .split('\n')
    .map((line) => `<p>${line}</p>`)
    .join('')
  await sendEmail({
    to,
    subject,
    html,
    attachments: pdfAttachments.map((a) => ({ filename: a.filename, content: a.buffer })),
    ownerId,
  })
}

export async function sendStatementEmail(
  ownerId: string,
  to: string | string[],
  tenantName: string,
  balance: number,
  pdfBuffer: Buffer,
  subjectTemplate?: string,
  bodyTemplate?: string,
  propertyName?: string | null,
) {
  const vars: Record<string, string> = {
    imie: tenantName,
    saldo: formatAmount(balance),
  }
  const applyVars = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')

  const subjectText = subjectTemplate || DEFAULT_STATEMENT_EMAIL_SUBJECT
  const bodyText = bodyTemplate || DEFAULT_STATEMENT_EMAIL_BODY

  const subject = withTypeLabel(applyVars(subjectText), 'Rozliczenie salda', propertyName)
  const html = applyVars(bodyText).split('\n').map(l => l ? `<p>${l}</p>` : '<br>').join('')
  
  const attachments = [{ filename: 'Wyciag_z_konta.pdf', content: pdfBuffer }]

  await sendEmail({ to, subject, html, attachments, ownerId })
}

export async function sendStatementUploadReminderEmail(
  ownerId: string,
  to: string | string[],
  subjectTemplate?: string | null,
  bodyTemplate?: string | null,
) {
  const subject = subjectTemplate || DEFAULT_STATEMENT_UPLOAD_REMINDER_SUBJECT
  const bodyText = bodyTemplate || DEFAULT_STATEMENT_UPLOAD_REMINDER_BODY
  const html = bodyText.split('\n').map((l) => (l ? `<p>${l}</p>` : '<br>')).join('')
  await sendEmail({ to, subject, html, ownerId })
}

export async function sendMediaSettlementAdminSummaryEmail(
  ownerId: string,
  to: string | string[],
  groupName: string,
  month: number,
  year: number,
  entries: { tenantName: string; amount: number }[],
) {
  const subject = `Rozliczenie mediów – ${groupName} – ${String(month).padStart(2, '0')}/${year}`
  const rows = entries.length
    ? entries.map((e) => `<li>${e.tenantName}: ${formatAmount(e.amount)}</li>`).join('')
    : '<li><em>brak pozycji</em></li>'
  const total = entries.reduce((sum, e) => sum + e.amount, 0)
  const html =
    `<p>Zakończono rozliczenie mediów grupy <strong>${groupName}</strong> za ${String(month).padStart(2, '0')}/${year}.</p>` +
    `<p>Ostateczne kwoty per najemca (do wystawienia rachunków w KSeF):</p>` +
    `<ul>${rows}</ul>` +
    `<p>Suma: <strong>${formatAmount(total)}</strong></p>`
  await sendEmail({ to, subject, html, ownerId })
}

export async function sendMeterReadingReminderEmail(
  ownerId: string,
  to: string | string[],
  tenantName: string,
  link: string,
  subjectTemplate?: string | null,
  bodyTemplate?: string | null,
) {
  const vars: Record<string, string> = { imie: tenantName, link }
  const applyVars = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  const subject = applyVars(subjectTemplate || DEFAULT_METER_READING_REMINDER_SUBJECT)
  const bodyText = applyVars(bodyTemplate || DEFAULT_METER_READING_REMINDER_BODY)
  const html = bodyText.split('\n').map((l) => (l ? `<p>${l}</p>` : '<br>')).join('')
  await sendEmail({ to, subject, html, ownerId })
}

