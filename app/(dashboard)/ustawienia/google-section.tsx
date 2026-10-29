'use client'

import { Suspense, useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { disconnectGoogle, getGoogleStatus, type GoogleStatus } from './google-actions'

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Konto Google połączone.' },
  config_missing: { ok: false, text: 'Łączenie z Google nie jest jeszcze skonfigurowane na tym środowisku.' },
  state_invalid: { ok: false, text: 'Nie udało się potwierdzić żądania łączenia (state). Spróbuj ponownie.' },
  access_denied: { ok: false, text: 'Zgoda w Google nie została udzielona.' },
  not_allowed: { ok: false, text: 'Ten adres Google nie jest dozwolony do połączenia z aplikacją.' },
  scope_missing: { ok: false, text: 'Brak zgody na wysyłanie e-maili (gmail.send). Zaznacz ją na ekranie zgody.' },
  no_refresh_token: { ok: false, text: 'Google nie zwróciło tokenu odnowienia. Usuń dostęp aplikacji w koncie Google i połącz ponownie.' },
  error: { ok: false, text: 'Łączenie z Google nie powiodło się. Spróbuj ponownie.' },
}

function GoogleSectionInner() {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const code = useSearchParams().get('google')
  const message = code ? MESSAGES[code] ?? MESSAGES.error : null

  useEffect(() => {
    getGoogleStatus().then(setStatus)
  }, [code])

  function handleDisconnect() {
    if (!confirm('Odłączyć konto Google? Wysyłka e-maili z Twojego konta przestanie działać.')) return
    startTransition(async () => {
      try {
        await disconnectGoogle()
        setStatus(await getGoogleStatus())
        toast.success('Konto Google odłączone.')
        router.replace('/ustawienia')
      } catch (e) {
        toast.error(`Błąd odłączania: ${e instanceof Error ? e.message : 'nieznany'}`)
      }
    })
  }

  return (
    <div className="space-y-1" data-testid="google-section">
      <h2 className="text-lg font-semibold">Google</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-3">
        Połączenie konta Google pozwala wysyłać e-maile (np. przypomnienia i noty) z Twojego adresu. Aplikacja prosi
        wyłącznie o zgodę na wysyłanie wiadomości.
      </p>

      {message && (
        <p role="status" data-testid="google-message" className={`text-sm mb-2 ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      {!status ? (
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      ) : status.status === 'connected' ? (
        <div className="space-y-2">
          <p className="text-sm" data-testid="google-status">
            Połączono jako <strong>{status.email}</strong>
            {status.lastOkAt && <span className="text-muted-foreground"> (ostatnie użycie: {new Date(status.lastOkAt).toLocaleString('pl-PL')})</span>}
          </p>
          <Button variant="outline" onClick={handleDisconnect} disabled={pending}>
            Odłącz
          </Button>
        </div>
      ) : status.status === 'needs_reauth' ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive" data-testid="google-status">
            Wymaga ponownego połączenia{status.email ? ` (${status.email})` : ''}
          </p>
          <div className="flex gap-2">
            <a href="/api/google/connect" className={buttonVariants()}>
              Połącz ponownie
            </a>
            <Button variant="outline" onClick={handleDisconnect} disabled={pending}>
              Odłącz
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm" data-testid="google-status">Niepołączono</p>
          <a href="/api/google/connect" className={buttonVariants()}>
            Połącz z Google
          </a>
        </div>
      )}
    </div>
  )
}

export function GoogleSection() {
  return (
    <Suspense fallback={null}>
      <GoogleSectionInner />
    </Suspense>
  )
}
