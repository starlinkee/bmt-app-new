'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function requestPasswordResetAction(formData: FormData) {
  const email = (formData.get('email') as string)?.trim()
  if (!email) {
    return { error: 'Podaj adres e-mail.' }
  }

  const supabase = await createClient()
  const origin = await getOrigin()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  })

  // Rate limit to jedyny błąd, który warto pokazać — poza tym nie zdradzamy,
  // czy konto o danym adresie istnieje.
  if (error?.status === 429) {
    return { error: 'Zbyt wiele prób. Spróbuj ponownie za chwilę.' }
  }

  return { sent: true }
}

/** Origin bieżącego żądania — działa też na deployach preview. */
async function getOrigin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
