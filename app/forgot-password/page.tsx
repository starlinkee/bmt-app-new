'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPasswordResetAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string; sent?: boolean } | null, formData: FormData) => {
      return requestPasswordResetAction(formData)
    },
    null,
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">BMT — reset hasła</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state?.sent ? (
            <p className="text-sm">
              Jeśli konto o tym adresie istnieje, wysłaliśmy na nie link do
              ustawienia nowego hasła.
            </p>
          ) : (
            <form action={action} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              {state?.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Wysyłanie…' : 'Wyślij link'}
              </Button>
            </form>
          )}
          <Link
            href="/login"
            className="block text-center text-sm text-muted-foreground hover:underline"
          >
            Wróć do logowania
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
