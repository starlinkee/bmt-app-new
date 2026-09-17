'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { upsertAppConfig } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

function SavedNote() {
  return <p className="text-xs text-muted-foreground/80">Zmiany zapisują się od razu dla przyszłych wysyłek.</p>
}

export function LateReminderForm({ initialSubject, initialBody }: { initialSubject: string, initialBody: string }) {
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertAppConfig({ late_reminder_subject: subject, late_reminder_body: body })
        toast.success('Szablon zapisany.')
      } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e)
        toast.error(`Błąd zapisu: ${msg}`)
      }
    })
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <p className="text-sm font-medium">Szablon wiadomości</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dostępne zmienne:{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{imie}'}</code>{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{saldo}'}</code>
        </p>
      </div>
      <div className="space-y-1">
        <Label>Temat wiadomości</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Treść wiadomości</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
      </div>
      <Button size="sm" onClick={handleSave} disabled={pending}>Zapisz szablon</Button>
      <SavedNote />
    </div>
  )
}

export function MeterReminderForm({ initialSubject, initialBody }: { initialSubject: string, initialBody: string }) {
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertAppConfig({ meter_reading_reminder_subject: subject, meter_reading_reminder_body: body })
        toast.success('Szablon zapisany.')
      } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e)
        toast.error(`Błąd zapisu: ${msg}`)
      }
    })
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <p className="text-sm font-medium">Szablon wiadomości</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dostępne zmienne:{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{imie}'}</code>{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{link}'}</code>{' '}
          (spersonalizowany link do formularza odczytów danego najemcy)
        </p>
      </div>
      <div className="space-y-1">
        <Label>Temat wiadomości</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Treść wiadomości</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
      </div>
      <Button size="sm" onClick={handleSave} disabled={pending}>Zapisz szablon</Button>
      <SavedNote />
    </div>
  )
}
