'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { getAppConfig, upsertAppConfig } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function SettingsPage() {
  const [form, setForm] = useState({
    late_reminder_subject: 'Rozliczenie wpłat i rachunków - BMT',
    late_reminder_body: 'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT',
  })
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const config = await getAppConfig()
      if (config) {
        setForm({
          late_reminder_subject: (config as Record<string, unknown>).late_reminder_subject as string ?? 'Rozliczenie wpłat i rachunków - BMT',
          late_reminder_body: (config as Record<string, unknown>).late_reminder_body as string ?? 'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT',
        })
      }
    })
  }, [])

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertAppConfig({
          late_reminder_subject: form.late_reminder_subject,
          late_reminder_body: form.late_reminder_body,
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
    </div>
  )
}
