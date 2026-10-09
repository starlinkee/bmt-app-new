'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const MIN_PASSWORD_LENGTH = 8

type Status = 'loading' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const router = useRouter()
  // Osobny klient bez automatycznego wykrywania sesji w URL — domyślny klient
  // działa w trybie PKCE i odrzuca tokeny z hasha (implicit flow), które
  // wysyła panel Supabase. Hash obsługujemy ręcznie poniżej.
  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { isSingleton: false, auth: { detectSessionInUrl: false } },
      ),
    [],
  )

  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false

    function fail(msg: string) {
      if (cancelled) return
      setMessage(msg)
      setStatus('invalid')
    }

    async function init() {
      const hash = new URLSearchParams(window.location.hash.slice(1))
      if (window.location.hash) {
        // Tokeny nie powinny zostać w historii przeglądarki.
        window.history.replaceState(null, '', window.location.pathname)
      }

      if (hash.has('error_code')) {
        fail(
          hash.get('error_code') === 'otp_expired'
            ? 'Link do resetu hasła wygasł lub został już użyty.'
            : 'Link do resetu hasła jest nieprawidłowy.',
        )
        return
      }

      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          fail('Link do resetu hasła jest nieprawidłowy lub wygasł.')
          return
        }
      }

      // Sesja mogła też zostać ustawiona wcześniej przez /auth/confirm.
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      if (data.user) {
        setStatus('ready')
      } else {
        fail('Brak aktywnej sesji resetu hasła. Poproś o nowy link.')
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const password = formData.get('password') as string
    const confirm = formData.get('confirm') as string

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`)
      return
    }
    if (password !== confirm) {
      setError('Hasła nie są identyczne.')
      return
    }

    setPending(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setPending(false)

    if (error) {
      setError(
        error.code === 'same_password'
          ? 'Nowe hasło musi różnić się od poprzedniego.'
          : error.code === 'weak_password'
            ? 'Hasło jest zbyt słabe.'
            : 'Nie udało się zmienić hasła. Spróbuj ponownie.',
      )
      return
    }

    setStatus('done')
    setTimeout(() => {
      router.replace('/')
      router.refresh()
    }, 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">BMT — ustaw nowe hasło</CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'loading' && (
            <p className="text-sm text-muted-foreground">Weryfikacja linku…</p>
          )}

          {status === 'invalid' && (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{message}</p>
              <Link href="/forgot-password" className={buttonVariants({ className: 'w-full' })}>
                Wyślij nowy link
              </Link>
            </div>
          )}

          {status === 'done' && (
            <p className="text-sm">Hasło zostało zmienione. Przekierowanie…</p>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="password">Nowe hasło</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm">Powtórz hasło</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Zapisywanie…' : 'Zmień hasło'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
