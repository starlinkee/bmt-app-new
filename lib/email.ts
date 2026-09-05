import nodemailer from 'nodemailer'
import { createServiceClient } from '@/lib/supabase/service'
import { formatAmount } from '@/lib/utils'

type EmailProvider = 'gmail_smtp'

type ProviderConfig = {
  provider: EmailProvider
  gmailUser: string | null
  gmailAppPassword: string | null
}

async function getProviderConfig(account: 1 | 2 = 1): Promise<ProviderConfig> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_config')
    .select('email_provider, gmail_user, gmail_app_password, email_provider_2, gmail_user_2, gmail_app_password_2')
    .eq('id', 1)
    .single()
  if (account === 2) {
    return {
      provider: (data?.email_provider_2 as EmailProvider) ?? 'gmail_smtp',
      gmailUser: data?.gmail_user_2 ?? null,
      gmailAppPassword: data?.gmail_app_password_2 ?? null,
    }
  }
  return {
    provider: (data?.email_provider as EmailProvider) ?? 'gmail_smtp',
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

    try {
      const supabase = createServiceClient()
      const recipients = Array.isArray(to) ? to.join(', ') : to
      await supabase.from('email_logs').insert({
        to_email: recipients,
        subject,
        body: html,
      })
    } catch (e) {
      console.error('Failed to log email', e)
    }
  }
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
) {
  const cfg = await getProviderConfig(senderAccount)
  const vars: Record<string, string> = {
    najemca: tenantName,
    numer_rachunku: invoiceNumber || '',
    kwota: formatAmount(amount),
    miesiac: String(month),
    rok: String(year),
  }
  const applyVars = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  const subject = applyVars(subjectTemplate || DEFAULT_RENT_EMAIL_SUBJECT)
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
) {
  const cfg = await getProviderConfig(senderAccount)
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
  senderAccount: 1 | 2 = 1,
) {
  const cfg = await getProviderConfig(senderAccount)
  const subject = applyReminderTemplate(subjectTemplate, tenantName, month, year, rentAmount)
  const html = applyReminderTemplate(bodyTemplate, tenantName, month, year, rentAmount)
    .split('\n')
    .map((line) => `<p>${line}</p>`)
    .join('')
  await sendEmail({ to, subject, html, cfg })
}

export async function sendStatementEmail(
  to: string | string[],
  tenantName: string,
  balance: number,
  pdfBuffer: Buffer,
  senderAccount: 1 | 2 = 1,
  subjectTemplate?: string,
  bodyTemplate?: string,
) {
  const cfg = await getProviderConfig(senderAccount)
  const vars: Record<string, string> = {
    imie: tenantName,
    saldo: formatAmount(balance),
  }
  const applyVars = (tpl: string) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  
  const subjectText = subjectTemplate || 'Rozliczenie wpłat i rachunków - BMT'
  const bodyText = bodyTemplate || 'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT'

  const subject = applyVars(subjectText)
  const html = applyVars(bodyText).split('\n').map(l => l ? `<p>${l}</p>` : '<br>').join('')
  
  const attachments = [{ filename: 'Wyciag_z_konta.pdf', content: pdfBuffer }]
  
  await sendEmail({ to, subject, html, attachments, cfg })
}

