'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { getAppConfig, upsertAppConfig } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const DEFAULT_MAPPING = JSON.stringify(
  [
    { range: 'B2', value: '{najemca}' },
    { range: 'B3', value: '{adres_1}' },
    { range: 'B4', value: '{adres_2}' },
    { range: 'B5', value: '{numer_rachunku}' },
    { range: 'B6', value: '{kwota}' },
    { range: 'B7', value: '{kwota_slownie}' },
    { range: 'B8', value: '{miesiac}/{rok}' },
    { range: 'B9', value: '{data_wystawienia}' },
    { range: 'B10', value: '{termin_platnosci}' },
    { range: 'B11', value: '{opis_rachunku}' },
    { range: 'B12', value: '{nip}' },
  ],
  null,
  2,
)

const DEFAULT_REMINDER_SUBJECT = 'Przypomnienie o płatności czynszu {miesiac}/{rok}'
const DEFAULT_REMINDER_BODY =
  'Szanowny/a {imie},\n\nPrzypominamy o płatności czynszu za {miesiac}/{rok} w kwocie {kwota} zł.\n\nPozdrawiamy,\nBMT'

const DEFAULT_RENT_EMAIL_SUBJECT = 'Faktura czynszu {numer_rachunku}'
const DEFAULT_RENT_EMAIL_BODY =
  'Szanowny/a {najemca},\n\nW załączeniu faktura za czynsz nr {numer_rachunku} za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy,\nBMT'

export default function SettingsPage() {
  const [form, setForm] = useState({
    rent_invoice_spreadsheet_id: '',
    rent_invoice_input_mapping_json: DEFAULT_MAPPING,
    rent_invoice_pdf_gid: '',
    drive_invoices_folder_id: '',
    reminder_subject: DEFAULT_REMINDER_SUBJECT,
    reminder_body: DEFAULT_REMINDER_BODY,
    late_reminder_subject: 'Rozliczenie wpłat i rachunków - BMT',
    late_reminder_body: 'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT',
    rent_email_subject: DEFAULT_RENT_EMAIL_SUBJECT,
    rent_email_body: DEFAULT_RENT_EMAIL_BODY,
    gmail_user: '',
    gmail_app_password: '',
    gmail_user_2: '',
    gmail_app_password_2: '',
  })
  const [jsonError, setJsonError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const config = await getAppConfig()
      if (config) {
        setForm({
          rent_invoice_spreadsheet_id: config.rent_invoice_spreadsheet_id ?? '',
          rent_invoice_input_mapping_json: JSON.stringify(
            config.rent_invoice_input_mapping_json,
            null,
            2,
          ),
          rent_invoice_pdf_gid: config.rent_invoice_pdf_gid ?? '',
          drive_invoices_folder_id: config.drive_invoices_folder_id ?? '',
          reminder_subject: config.reminder_subject ?? DEFAULT_REMINDER_SUBJECT,
          reminder_body: config.reminder_body ?? DEFAULT_REMINDER_BODY,
          late_reminder_subject: (config as Record<string, unknown>).late_reminder_subject as string ?? 'Rozliczenie wpłat i rachunków - BMT',
          late_reminder_body: (config as Record<string, unknown>).late_reminder_body as string ?? 'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT',
          rent_email_subject: (config as Record<string, unknown>).rent_email_subject as string ?? DEFAULT_RENT_EMAIL_SUBJECT,
          rent_email_body: (config as Record<string, unknown>).rent_email_body as string ?? DEFAULT_RENT_EMAIL_BODY,
          gmail_user: config.gmail_user ?? '',
          gmail_app_password: config.gmail_app_password ?? '',
          gmail_user_2: (config as Record<string, unknown>).gmail_user_2 as string ?? '',
          gmail_app_password_2: (config as Record<string, unknown>).gmail_app_password_2 as string ?? '',
        })
      }
    })
  }, [])

  function handleSave() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mapping: any
    try {
      mapping = JSON.parse(form.rent_invoice_input_mapping_json)
    } catch {
      setJsonError('Nieprawidłowy JSON mapowania.')
      return
    }
    setJsonError('')

    startTransition(async () => {
      try {
        await upsertAppConfig({
          rent_invoice_spreadsheet_id: form.rent_invoice_spreadsheet_id,
          rent_invoice_input_mapping_json: mapping,
          rent_invoice_pdf_gid: form.rent_invoice_pdf_gid,
          drive_invoices_folder_id: form.drive_invoices_folder_id,
          reminder_subject: form.reminder_subject,
          reminder_body: form.reminder_body,
          late_reminder_subject: form.late_reminder_subject,
          late_reminder_body: form.late_reminder_body,
          rent_email_subject: form.rent_email_subject || null,
          rent_email_body: form.rent_email_body || null,
          email_provider: 'gmail_smtp',
          gmail_user: form.gmail_user || null,
          gmail_app_password: form.gmail_app_password || null,
          email_provider_2: 'gmail_smtp',
          gmail_user_2: form.gmail_user_2 || null,
          gmail_app_password_2: form.gmail_app_password_2 || null,
        })
        toast.success('Ustawienia zapisane.')
      } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e)
        toast.error(`Błąd zapisu: ${msg}`)
      }
    })
  }

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Ustawienia</h1>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Wzór rachunku czynszowego</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Arkusz Google Sheets służący jako szablon do generowania rachunków czynszowych.
            System wypełnia go danymi najemcy i eksportuje jako PDF.
          </p>
        </div>

        <div className="space-y-1">
          <Label>ID arkusza — wzór rachunku</Label>
          <Input
            value={form.rent_invoice_spreadsheet_id}
            onChange={(e) =>
              setForm({ ...form, rent_invoice_spreadsheet_id: e.target.value })
            }
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          />
          <p className="text-xs text-muted-foreground">
            ID z URL arkusza: docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit
          </p>
        </div>

        <div className="space-y-1">
          <Label>Mapowanie pól do komórek arkusza (JSON)</Label>
          <Textarea
            value={form.rent_invoice_input_mapping_json}
            onChange={(e) =>
              setForm({ ...form, rent_invoice_input_mapping_json: e.target.value })
            }
            rows={8}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Tablica obiektów: <code className="bg-muted px-1 rounded">range</code> = adres komórki (np. &quot;B2&quot;),
            {' '}<code className="bg-muted px-1 rounded">value</code> = wartość z dostępnymi zmiennymi:
            {' '}<code className="bg-muted px-1 rounded">{'{najemca}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{numer_rachunku}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{kwota}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{kwota_slownie}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{adres_1}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{adres_2}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{nip}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{miesiac}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{rok}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{data_wystawienia}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{termin_platnosci}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{opis_rachunku}'}</code>
          </p>
          {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
        </div>

        <div className="space-y-1">
          <Label>GID zakładki PDF</Label>
          <Input
            value={form.rent_invoice_pdf_gid}
            onChange={(e) =>
              setForm({ ...form, rent_invoice_pdf_gid: e.target.value })
            }
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            Numer zakładki (gid) eksportowanej do PDF. Domyślnie 0 (pierwsza zakładka).
            Widoczny w URL: …/edit#gid=<strong>[GID]</strong>
          </p>
        </div>

        <div className="space-y-1">
          <Label>ID folderu Drive — miejsce zapisu rachunków</Label>
          <Input
            value={form.drive_invoices_folder_id}
            onChange={(e) =>
              setForm({ ...form, drive_invoices_folder_id: e.target.value })
            }
            placeholder="1A2B3C4D5E6F7G8H9I0J"
          />
          <p className="text-xs text-muted-foreground">
            ID folderu Google Drive, do którego trafiają wygenerowane PDFy rachunków.
            ID z URL folderu: drive.google.com/drive/folders/<strong>[ID]</strong>
          </p>
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>

      <hr />

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Automatyczne ponaglenia (wezwania do zapłaty)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Wiadomość z ponagleniem jest wysyłana automatycznie do najemców, którzy po zaimportowaniu wyciągów (np. 15. dnia miesiąca) wciąż mają niedopłatę na swoim koncie.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Dostępne zmienne w temacie i treści:{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{imie}'}</code>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{saldo}'}</code>
          </p>
        </div>

        <div className="space-y-1">
          <Label>Temat wiadomości</Label>
          <Input
            value={form.late_reminder_subject}
            onChange={(e) => setForm({ ...form, late_reminder_subject: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label>Treść wiadomości</Label>
          <Textarea
            value={form.late_reminder_body}
            onChange={(e) => setForm({ ...form, late_reminder_body: e.target.value })}
            rows={6}
          />
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>

      <hr />

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Wysyłka e-mail — konto 1</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Główne konto Gmail używane do wysyłania wiadomości e-mail z aplikacji.
          </p>
        </div>

        <div className="space-y-1">
          <Label>Adres Gmail</Label>
          <Input
            type="email"
            value={form.gmail_user}
            onChange={(e) => setForm({ ...form, gmail_user: e.target.value })}
            placeholder="twoj@gmail.com"
          />
        </div>
        <div className="space-y-1">
          <Label>Hasło aplikacji Google</Label>
          <Input
            type="password"
            value={form.gmail_app_password}
            onChange={(e) => setForm({ ...form, gmail_app_password: e.target.value })}
            placeholder="xxxx xxxx xxxx xxxx"
          />
          <p className="text-xs text-muted-foreground">
            Wygeneruj w: Konto Google → Bezpieczeństwo → Weryfikacja dwuetapowa → Hasła do aplikacji.
            Wymagana włączona weryfikacja dwuetapowa.
          </p>
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>

      <hr />

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Wysyłka e-mail — konto 2</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Drugie konto nadawcy. Możesz przypisać je wybranym najemcom przy tworzeniu lub edycji.
          </p>
        </div>

        <div className="space-y-1">
          <Label>Adres Gmail (konto 2)</Label>
          <Input
            type="email"
            value={form.gmail_user_2}
            onChange={(e) => setForm({ ...form, gmail_user_2: e.target.value })}
            placeholder="drugie@gmail.com"
          />
        </div>
        <div className="space-y-1">
          <Label>Hasło aplikacji Google (konto 2)</Label>
          <Input
            type="password"
            value={form.gmail_app_password_2}
            onChange={(e) => setForm({ ...form, gmail_app_password_2: e.target.value })}
            placeholder="xxxx xxxx xxxx xxxx"
          />
          <p className="text-xs text-muted-foreground">
            Wygeneruj w: Konto Google → Bezpieczeństwo → Weryfikacja dwuetapowa → Hasła do aplikacji.
          </p>
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>

      <hr />

      <div className="space-y-4 opacity-75">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-muted-foreground">Automatyczne przypomnienia (wyłączone)</h2>
            <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">Tymczasowo nieaktywne</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <del>Wysyłane automatycznie <strong>1. dnia każdego miesiąca o 8:00</strong> do wszystkich
            aktywnych najemców z umową prywatną/BMT, którzy mają podany adres e-mail.</del><br/>
            Obecnie automatyczna wysyłka przypomnień o czynszu pierwszego dnia miesiąca jest wyłączona w systemie.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Dostępne zmienne w temacie i treści:{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{imie}'}</code>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{kwota}'}</code>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{miesiac}'}</code>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{rok}'}</code>
          </p>
        </div>

        <div className="space-y-1">
          <Label>Temat wiadomości</Label>
          <Input
            value={form.reminder_subject}
            onChange={(e) => setForm({ ...form, reminder_subject: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label>Treść wiadomości</Label>
          <Textarea
            value={form.reminder_body}
            onChange={(e) => setForm({ ...form, reminder_body: e.target.value })}
            rows={6}
          />
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>

      <hr />

      <div className="space-y-4 opacity-75">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-muted-foreground">E-mail z fakturą czynszową (wyłączone)</h2>
            <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">Tymczasowo nieaktywne</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <del>Treść wiadomości wysyłanej najemcy wraz z fakturą PDF przy generowaniu czynszów.</del><br/>
            Obecnie automatyczna wysyłka e-maili z fakturą czynszową jest wyłączona w systemie.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Dostępne zmienne w temacie i treści:{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{najemca}'}</code>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{numer_rachunku}'}</code>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{kwota}'}</code>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{miesiac}'}</code>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{rok}'}</code>
          </p>
        </div>

        <div className="space-y-1">
          <Label>Temat wiadomości</Label>
          <Input
            value={form.rent_email_subject}
            onChange={(e) => setForm({ ...form, rent_email_subject: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label>Treść wiadomości</Label>
          <Textarea
            value={form.rent_email_body}
            onChange={(e) => setForm({ ...form, rent_email_body: e.target.value })}
            rows={6}
          />
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>

    </div>
  )
}
