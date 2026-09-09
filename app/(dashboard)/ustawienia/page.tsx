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
    ignored_source_accounts: '',
    statement_cutoff_day: 15,
  })
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const config = await getAppConfig()
      if (config) {
        setForm({
          late_reminder_subject: (config as Record<string, unknown>).late_reminder_subject as string ?? 'Rozliczenie wpłat i rachunków - BMT',
          late_reminder_body: (config as Record<string, unknown>).late_reminder_body as string ?? 'Szanowny/a {imie},\n\nPrzesyłamy w załączeniu aktualne podsumowanie Państwa konta. Saldo na dzień dzisiejszy wynosi: {saldo}.\n\nProsimy o uregulowanie należności.\n\nPozdrawiamy,\nBMT',
          ignored_source_accounts: (config as Record<string, unknown>).ignored_source_accounts as string ?? '',
          statement_cutoff_day: (config as Record<string, unknown>).statement_cutoff_day as number ?? 15,
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
          ignored_source_accounts: form.ignored_source_accounts,
          statement_cutoff_day: form.statement_cutoff_day,
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
          <h2 className="text-lg font-semibold">Mail z rozliczeniem / wyciągiem z konta</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ten szablon (temat i treść) jest używany przy wysyłce wyciągu z konta do najemcy — zarówno ręcznie z listy najemców/kontroli płatności, jak i automatycznie do najemców z niedopłatą po zaimportowaniu wyciągów (np. 15. dnia miesiąca).
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

        <div className="space-y-1 mt-6">
          <h2 className="text-lg font-semibold">Ignorowane rachunki źródłowe</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Podaj rachunki źródłowe (jeden na linię), z których przelewy to Twoje własne środki (przelewy od Ciebie do Ciebie).
            Przy imporcie wyciągów z CSV, system automatycznie rozpozna takie wpłaty i oznaczy je jako własne.
          </p>
          <Textarea
            value={form.ignored_source_accounts}
            onChange={(e) => setForm({ ...form, ignored_source_accounts: e.target.value })}
            rows={4}
            placeholder="Np. 12345678901234567890123456"
          />
        </div>

        <div className="space-y-1 mt-6">
          <h2 className="text-lg font-semibold">Okres wyciągu bankowego</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Dzień miesiąca, na którym domyślnie &bdquo;przecina się&rdquo; okres wyciągu — używany do podpowiadania
            zakresu dni przy imporcie wyciągów (np. przy 15 zakres to 16. dzień poprzedniego miesiąca
            do 15. dnia bieżącego).
          </p>
          <Input
            type="number"
            min={1}
            max={31}
            className="w-24"
            value={form.statement_cutoff_day}
            onChange={(e) => setForm({ ...form, statement_cutoff_day: Number(e.target.value) || 15 })}
          />
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>
    </div>
  )
}
