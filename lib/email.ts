import { Resend } from 'resend'
import { formatAmount } from '@/lib/utils'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

function getFrom() {
  return process.env.RESEND_FROM ?? 'BMT <noreply@example.com>'
}

function replyOpts() {
  const replyTo = process.env.RESEND_REPLY_TO
  return replyTo ? { replyTo } : {}
}

export async function sendRentEmail(
  to: string,
  tenantName: string,
  invoiceNumber: string,
  amount: number,
  month: number,
  year: number,
  pdfBuffer?: Buffer,
) {
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

  await getResend().emails.send({
    from: getFrom(),
    to,
    subject,
    html,
    attachments,
    ...replyOpts(),
  })
}

export async function sendMediaEmail(
  to: string,
  tenantName: string,
  invoiceNumber: string,
  amount: number,
  month: number,
  year: number,
) {
  const subject = `Faktura media ${invoiceNumber}`
  const html = `
    <p>Szanowny/a ${tenantName},</p>
    <p>W załączeniu rozliczenie mediów nr <strong>${invoiceNumber}</strong>
       za ${month}/${year} na kwotę <strong>${formatAmount(amount)}</strong>.</p>
    <p>Pozdrawiamy,<br>BMT</p>
  `

  await getResend().emails.send({
    from: getFrom(),
    to,
    subject,
    html,
    ...replyOpts(),
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
  to: string,
  tenantName: string,
  month: number,
  year: number,
  rentAmount: number,
  subjectTemplate: string,
  bodyTemplate: string,
) {
  const subject = applyReminderTemplate(subjectTemplate, tenantName, month, year, rentAmount)
  const html = applyReminderTemplate(bodyTemplate, tenantName, month, year, rentAmount)
    .split('\n')
    .map((line) => `<p>${line}</p>`)
    .join('')

  await getResend().emails.send({
    from: getFrom(),
    to,
    subject,
    html,
    ...replyOpts(),
  })
}
