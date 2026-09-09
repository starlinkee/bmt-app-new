import nodemailer from 'nodemailer'
import { createServiceClient } from '@/lib/supabase/service'
import { formatAmount } from '@/lib/utils'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

type EmailProvider = 'gmail_smtp'

type ProviderConfig = {
  provider: EmailProvider
  gmailUser: string | null
  gmailAppPassword: string | null
}

async function getProviderConfig(): Promise<ProviderConfig> {
  return {
    provider: 'gmail_smtp',
    gmailUser: process.env.GMAIL_USER ?? null,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD ?? null,
  }
}

type SendParams = {
  to: string | string[]
  subject: string
  html: string
  attachments?: { filename: string; content: Buffer }[]
  cfg: ProviderConfig
}

async function sendEmail({ to, subject, html, attachments = [], cfg }: SendParams) {
  const finalTo = to;
  const finalSubject = subject;
  const finalHtml = html;

  const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';

  if (cfg.provider === 'gmail_smtp') {
    if (!cfg.gmailUser || !cfg.gmailAppPassword) {
      throw new Error('Gmail SMTP skonfigurowany ale brak adresu lub hasła aplikacji.')
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

const DEFAULT_RENT_EMAIL_SUBJECT = 'Faktura czynszu {numer_rachunku}'
const DEFAULT_RENT_EMAIL_BODY =
  'Szanowny/a {najemca},\n\nW załączeniu faktura za czynsz nr {numer_rachunku} za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy,\nBMT'

export async function sendRentEmail(
  to: string | string[],
  tenantName: string,
  invoiceNumber: string | null,
  amount: number,
  month: number,
  year: number,
  pdfBuffer?: Buffer,
  senderAccount: 1 | 2 = 1,
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
  await sendEmail({ to, subject, html, attachments, cfg })
}

function applyMediaTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

export async function sendMediaEmail(
  to: string | string[],
  tenantName: string,
  invoiceNumber: string,
  amount: number,
  month: number,
  year: number,
  pdfAttachments: { filename: string; buffer: Buffer }[] = [],
  subjectTemplate?: string | null,
  bodyTemplate?: string | null,
  senderAccount: 1 | 2 = 1,
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
    subjectTemplate ? applyMediaTemplate(subjectTemplate, vars) : `Faktura media ${invoiceNumber}`,
    'Media',
    propertyName,
  )
  const bodyText = bodyTemplate
    ? applyMediaTemplate(bodyTemplate, vars)
    : `Szanowny/a ${tenantName},\nW załączeniu rozliczenie mediów nr ${invoiceNumber} za ${month}/${year} na kwotę ${formatAmount(amount)}.\n\nPozdrawiamy,\nBMT`
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
  })
}

export async function sendStatementEmail(
  to: string | string[],
  tenantName: string,
  balance: number,
  pdfBuffer: Buffer,
  senderAccount: 1 | 2 = 1,
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

  const subjectText = subjectTemplate || 'Rozliczenie wpłat i rachunków - BMT'
  const bodyText = bodyTemplate || 'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT'

  const subject = withTypeLabel(applyVars(subjectText), 'Rozliczenie salda', propertyName)
  const html = applyVars(bodyText).split('\n').map(l => l ? `<p>${l}</p>` : '<br>').join('')
  
  const attachments = [{ filename: 'Wyciag_z_konta.pdf', content: pdfBuffer }]

  await sendEmail({ to, subject, html, attachments, cfg })
}

export async function sendStatementUploadReminderEmail(to: string | string[]) {
  const cfg = await getProviderConfig()
  const subject = 'Przypomnienie: wgraj wyciąg z banku'
  const bodyText =
    'Przypomnienie automatyczne z systemu BMT.\n\nDzisiaj 16. dzień miesiąca — czas wgrać wyciąg z konta bankowego do systemu (sekcja Import).\n\nPozdrawiamy,\nBMT'
  const html = bodyText.split('\n').map((l) => (l ? `<p>${l}</p>` : '<br>')).join('')
  await sendEmail({ to, subject, html, cfg })
}

