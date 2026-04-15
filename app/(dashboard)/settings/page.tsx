'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { getAppConfig, upsertAppConfig } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const DEFAULT_MAPPING = JSON.stringify(
  {
    'Imię i nazwisko': 'B2',
    'Adres': 'B3',
    'Kwota': 'B4',
    'Numer faktury': 'B5',
    'Miesiąc': 'B6',
    'Rok': 'B7',
  },
  null,
  2,
)

const DEFAULT_REMINDER_SUBJECT = 'Przypomnienie o płatności czynszu {miesiac}/{rok}'
const DEFAULT_REMINDER_BODY =
  'Szanowny/a {imie},\n\nPrzypominamy o płatności czynszu za {miesiac}/{rok} w kwocie {kwota} zł.\n\nPozdrawiamy,\nBMT'

export default function SettingsPage() {
  const [form, setForm] = useState({
    rent_invoice_spreadsheet_id: '',
    rent_invoice_input_mapping_json: DEFAULT_MAPPING,
    rent_invoice_pdf_gid: '',
    drive_invoices_folder_id: '',
    reminder_subject: DEFAULT_REMINDER_SUBJECT,
    reminder_body: DEFAULT_REMINDER_BODY,
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
          reminder_subject: (config as Record<string, unknown>).reminder_subject as string ?? DEFAULT_REMINDER_SUBJECT,
          reminder_body: (config as Record<string, unknown>).reminder_body as string ?? DEFAULT_REMINDER_BODY,
        })
      }
    })
  }, [])

  function handleSave() {
    let mapping: Record<string, string>
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
        <div className="space-y-1">
          <Label>ID arkusza Google (faktury)</Label>
          <Input
            value={form.rent_invoice_spreadsheet_id}
            onChange={(e) =>
              setForm({ ...form, rent_invoice_spreadsheet_id: e.target.value })
            }
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          />
        </div>

        <div className="space-y-1">
          <Label>Mapowanie danych do arkusza (JSON)</Label>
          <Textarea
            value={form.rent_invoice_input_mapping_json}
            onChange={(e) =>
              setForm({ ...form, rent_invoice_input_mapping_json: e.target.value })
            }
            rows={8}
            className="font-mono text-xs"
          />
          {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
        </div>

        <div className="space-y-1">
          <Label>GID zakładki PDF (opcjonalne)</Label>
          <Input
            value={form.rent_invoice_pdf_gid}
            onChange={(e) =>
              setForm({ ...form, rent_invoice_pdf_gid: e.target.value })
            }
            placeholder="0"
          />
        </div>

        <div className="space-y-1">
          <Label>ID folderu Drive (faktury)</Label>
          <Input
            value={form.drive_invoices_folder_id}
            onChange={(e) =>
              setForm({ ...form, drive_invoices_folder_id: e.target.value })
            }
          />
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>

      <hr />

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Automatyczne przypomnienia</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Wysyłane automatycznie <strong>1. dnia każdego miesiąca o 8:00</strong> do wszystkich
            aktywnych najemców z umową prywatną, którzy mają podany adres e-mail.
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
    </div>
  )
}
