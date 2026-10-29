'use server'

import { revalidatePath } from 'next/cache'
import { getUserClient, requireUser } from '@/lib/auth-guard'
import { disconnect } from '@/lib/google-connection'

export type GoogleStatus = {
  status: 'connected' | 'needs_reauth' | 'disconnected' | 'none'
  email: string | null
  lastOkAt: string | null
}

/** Status połączenia z Google zalogowanego konta (klient sesji; RLS pokazuje tylko własny wiersz). */
export async function getGoogleStatus(): Promise<GoogleStatus> {
  const { supabase } = await getUserClient()
  const { data } = await supabase.from('google_connections').select('status, google_email, last_ok_at').maybeSingle()
  if (!data) return { status: 'none', email: null, lastOkAt: null }
  return { status: data.status, email: data.google_email, lastOkAt: data.last_ok_at }
}

export async function disconnectGoogle() {
  const { user } = await requireUser()
  await disconnect(user.id)
  revalidatePath('/ustawienia')
  revalidatePath('/', 'layout')
}
