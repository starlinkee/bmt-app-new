import nodemailer from 'nodemailer'
import { createServiceClient } from '@/lib/supabase/service'
import { getLegacyOwnerId, readAppConfig } from '@/lib/app-config'
import { formatAmount } from '@/lib/utils'
import {
  DEFAULT_RENT_EMAIL_SUBJECT,
  DEFAULT_RENT_EMAIL_BODY,
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
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

type EmailProvider = 'gmail_smtp'

type ProviderConfig = {
  provider: EmailProvider
  gmailUser: string | null
  gmailAppPassword: string | null
}

// Nadawca = adres administratora z ustawień (app_config.admin_email),
// hasło aplikacji Gmail pochodzi ze zmiennej środowiskowej GMAIL_APP_PASSWORD.
async function getProviderConfig(): Promise<ProviderConfig> {
  // Wspólny Gmail właściciela do slice 7: nadawcą jest adres administratora konta właściciela
  // (legacy_owner) niezależnie od konta, w którego imieniu idzie wysyłka.
  const config = await readAppConfig(await getLegacyOwnerId(), ['admin_email'])

  return {
    provider: 'gmail_smtp',
    gmailUser: config?.admin_email?.trim() || null,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD || null,
  }
}

type SendParams = {
  to: string | string[]
  subject: string
  html: string
  attachments?: { filename: string; content: Buffer }[]
  cfg: ProviderConfig
  // Konto, w imieniu którego idzie wysyłka (email_logs.owner_id); nadawca zostaje wspólny do slice 7.
  ownerId: string
}

function getEnvSubjectPrefix(): string {
  const tier = getEnvTier()
  if (tier === 'DEVELOPMENT') return '[DEVELOPMENT] '
  if (tier === 'PREVIEW') return '[PREVIEW] '
  return ''
}

async function sendEmail({ to, subject, html, attachments = [], cfg, ownerId }: SendParams) {
  const finalTo = to;
  const finalSubject = `${getEnvSubjectPrefix()}${subject}`;
  const finalHtml = html;

  const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';

  if (cfg.provider === 'gmail_smtp') {
    if (!cfg.gmailUser) {
      throw new Error('Brak adresu administratora w ustawieniach (/ustawienia) — jest używany jako adres nadawcy.')
    }
    if (!cfg.gmailAppPassword) {
      throw new Error('Brak zmiennej środowiskowej GMAIL_APP_PASSWORD (hasło aplikacji Gmail).')
    }
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: cfg.gmailUser, pass: cfg.gmailAppPassword },
    })
    await transporter.sendMail({
      from: cfg.gmailUser,
      to: finalTo,
      subject: finalSubject,
      html: finalHtml,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
    })

    try {
      const supabase = createServiceClient()
      const recipientsStr = Array.isArray(finalTo) ? finalTo.join(', ') : finalTo
      
      const savedAttachments = []
      if (attachments && attachments.length > 0) {
        for (const a of attachments) {
          const uniqueName = crypto.randomUUID() + '_' + a.filename
          const uploadPath = isPreview ? `preview/emails/${uniqueName}` : `emails/${uniqueName}`
          
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
  } else {
    throw new Error(`Nieobsługiwany dostawca email: ${cfg.provider}`)
  }
}

function withTypeLabel(subject: string, typeLabel: string, propertyName?: string | null) {
  const prefix = propertyName ? `${propertyName} – ${typeLabel}` : typeLabel
  return `${prefix}: ${subject}`
}

export async function sendRentEmail(
  ownerId: string,
  to: string | string[],
  tenantName: string,
  invoiceNumber: string | null,
  amount: number,
  month: number,
  year: number,
  pdfBuffer?: Buffer,
  subjectTemplate?: string | null,
  bodyTemplate?: string | null,
  propertyName?: string | null,
) {
  const cfg = await getProviderConfig()
  const vars: Record<string, string> = {
    najemca: tenantName,
    numer_rachunku: invoiceNumber || '',
    kwota: formatAmount(amount),
    miesiac: String(month),
    rok: String(year),
  }
  const applyVars = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  const subject = withTypeLabel(applyVars(subjectTemplate || DEFAULT_RENT_EMAIL_SUBJECT), 'Czynsz', propertyName)
  const bodyText = applyVars(bodyTemplate || DEFAULT_RENT_EMAIL_BODY)
  const html = bodyText.split('\n').map(l => `<p>${l}</p>`).join('')
  const attachments = pdfBuffer
    ? [{ filename: invoiceNumber ? `${invoiceNumber.replace(/\//g, '-')}.pdf` : 'Rachunek.pdf', content: pdfBuffer }]
    : []
  await sendEmail({ to, subject, html, attachments, cfg, ownerId })
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
  const cfg = await getProviderConfig()
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
    cfg,
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
  const cfg = await getProviderConfig()
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

  await sendEmail({ to, subject, html, attachments, cfg, ownerId })
}

export async function sendStatementUploadReminderEmail(
  ownerId: string,
  to: string | string[],
  subjectTemplate?: string | null,
  bodyTemplate?: string | null,
) {
  const cfg = await getProviderConfig()
  const subject = subjectTemplate || DEFAULT_STATEMENT_UPLOAD_REMINDER_SUBJECT
  const bodyText = bodyTemplate || DEFAULT_STATEMENT_UPLOAD_REMINDER_BODY
  const html = bodyText.split('\n').map((l) => (l ? `<p>${l}</p>` : '<br>')).join('')
  await sendEmail({ to, subject, html, cfg, ownerId })
}

export async function sendMediaSettlementAdminSummaryEmail(
  ownerId: string,
  to: string | string[],
  groupName: string,
  month: number,
  year: number,
  entries: { tenantName: string; amount: number }[],
) {
  const cfg = await getProviderConfig()
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
  await sendEmail({ to, subject, html, cfg, ownerId })
}

export async function sendMeterReadingReminderEmail(
  ownerId: string,
  to: string | string[],
  tenantName: string,
  link: string,
  subjectTemplate?: string | null,
  bodyTemplate?: string | null,
) {
  const cfg = await getProviderConfig()
  const vars: Record<string, string> = { imie: tenantName, link }
  const applyVars = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  const subject = applyVars(subjectTemplate || DEFAULT_METER_READING_REMINDER_SUBJECT)
  const bodyText = applyVars(bodyTemplate || DEFAULT_METER_READING_REMINDER_BODY)
  const html = bodyText.split('\n').map((l) => (l ? `<p>${l}</p>` : '<br>')).join('')
  await sendEmail({ to, subject, html, cfg, ownerId })
}

