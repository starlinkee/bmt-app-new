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
  const [paymentAccount1Name, setPaymentAccount1Name] = useState('')
  const [paymentAccount2Name, setPaymentAccount2Name] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const config = await getAppConfig()
      if (config) {
        const cfg = config as Record<string, unknown>
        setIgnoredSourceAccounts(cfg.ignored_source_accounts as string ?? '')
        setAdminEmail(cfg.admin_email as string ?? '')
        setPaymentAccount1Name(cfg.payment_account_1_name as string ?? 'Pekao')
        setPaymentAccount2Name(cfg.payment_account_2_name as string ?? 'Millennium')
      }
    })
  }, [])

  function handleSave() {
    startTransition(async () => {
      try {
        await upsertAppConfig({
          ignored_source_accounts: ignoredSourceAccounts,
          admin_email: adminEmail || null,
          payment_account_1_name: paymentAccount1Name,
          payment_account_2_name: paymentAccount2Name,
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
          <h2 className="text-lg font-semibold">Konta bankowe</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Nazwy 2 firmowych kont bankowych, na które wpływa czynsz od najemców. Używane przy
            przypisywaniu najemcy do konta oraz w kolumnie &quot;Ostatnia kontrola&quot; w module
            Kontrola płatności (konto 1 odpowiada importowi CSV, konto 2 — importowi PDF).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Konto 1</label>
              <Input
                value={paymentAccount1Name}
                onChange={(e) => setPaymentAccount1Name(e.target.value)}
                placeholder="np. Pekao"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Konto 2</label>
              <Input
                value={paymentAccount2Name}
                onChange={(e) => setPaymentAccount2Name(e.target.value)}
                placeholder="np. Millennium"
              />
            </div>
          </div>
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
