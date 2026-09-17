'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { getAppConfig, upsertAppConfig } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

export default function SettingsPage() {
  const [ignoredSourceAccounts, setIgnoredSourceAccounts] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const config = await getAppConfig()
      if (config) {
        const cfg = config as Record<string, unknown>
        setIgnoredSourceAccounts(cfg.ignored_source_accounts as string ?? '')
        setAdminEmail(cfg.admin_email as string ?? '')
      }
    })
  }, [])

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertAppConfig({ ignored_source_accounts: ignoredSourceAccounts, admin_email: adminEmail || null })
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
          <h2 className="text-lg font-semibold">Adres administratora</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Adres e-mail, na który przychodzą automatyczne przypomnienia dla administratora
            (np. o wgraniu wyciągu bankowego 16. dnia miesiąca).
          </p>
          <Input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="np. admin@example.com"
          />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Ignorowane rachunki źródłowe</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Podaj rachunki źródłowe (jeden na linię), z których przelewy to Twoje własne środki (przelewy od Ciebie do Ciebie).
            Przy imporcie wyciągów z CSV, system automatycznie rozpozna takie wpłaty i oznaczy je jako własne.
          </p>
          <Textarea
            value={ignoredSourceAccounts}
            onChange={(e) => setIgnoredSourceAccounts(e.target.value)}
            rows={4}
            placeholder="Np. 12345678901234567890123456"
          />
        </div>

        <Button onClick={handleSave} disabled={pending}>
          Zapisz ustawienia
        </Button>
      </div>
    </div>
  )
}
