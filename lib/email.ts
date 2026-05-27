import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import { createServiceClient } from '@/lib/supabase/service'
import { formatAmount } from '@/lib/utils'

type EmailProvider = 'resend' | 'gmail_smtp'

type ProviderConfig = {
  provider: EmailProvider
  gmailUser: string | null
  gmailAppPassword: string | null
}

async function getProviderConfig(): Promise<ProviderConfig> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_config')
    .select('email_provider, gmail_user, gmail_app_password')
    .eq('id', 1)
    .single()
  return {
    provider: (data?.email_provider as EmailProvider) ?? 'resend',
    gmailUser: data?.gmail_user ?? null,
    gmailAppPassword: data?.gmail_app_password ?? null,
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
      to,
      subject,
      html,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
    })
  } else {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const from = process.env.RESEND_FROM ?? 'BMT <noreply@example.com>'
    const replyTo = process.env.RESEND_REPLY_TO
    await resend.emails.send({
      from,
      to,
      subject,
      html,
      attachments,
      ...(replyTo ? { replyTo } : {}),
    })
  }
}

export async function sendRentEmail(
  to: string | string[],
  tenantName: string,
  invoiceNumber: string,
  amount: number,
  month: number,
  year: number,
  pdfBuffer?: Buffer,
) {
  const cfg = await getProviderConfig()
  const subject = `Faktura czynszu ${invoiceNumber}`
  const html = `
    <p>Szanowny/a ${tenantName},</p>
    <p>W załączeniu faktura za czynsz nr <strong>${invoiceNumber}</strong>
       za ${month}/${year} na kwotę <strong>${formatAmount(amount)}</strong>.</p>
    <p>Pozdrawiamy,<br>BMT</p>
  `
  const attachments = pdfBuffer
    ? [{ filename: `${invoiceNumber.replace(/\//g, '-')}.pdf`, content: pdfBuffer }]
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
) {
  const cfg = await getProviderConfig()
  const vars: Record<string, string> = {
    imie: tenantName,
    numer_rachunku: invoiceNumber,
    kwota: formatAmount(amount),
    miesiac: String(month),
    rok: String(year),
  }
  const subject = subjectTemplate
    ? applyMediaTemplate(subjectTemplate, vars)
    : `Faktura media ${invoiceNumber}`
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

function applyReminderTemplate(
  template: string,
  tenantName: string,
  month: number,
  year: number,
  rentAmount: number,
): string {
  return template
    .replace(/\{imie\}/gi, tenantName)
    .replace(/\{miesiac\}/gi, String(month))
    .replace(/\{rok\}/gi, String(year))
    .replace(/\{kwota\}/gi, formatAmount(rentAmount))
}

export async function sendPrivateMonthlyReminder(
  to: string | string[],
  tenantName: string,
  month: number,
  year: number,
  rentAmount: number,
  subjectTemplate: string,
  bodyTemplate: string,
) {
  const cfg = await getProviderConfig()
  const subject = applyReminderTemplate(subjectTemplate, tenantName, month, year, rentAmount)
  const html = applyReminderTemplate(bodyTemplate, tenantName, month, year, rentAmount)
    .split('\n')
    .map((line) => `<p>${line}</p>`)
    .join('')
  await sendEmail({ to, subject, html, cfg })
}
