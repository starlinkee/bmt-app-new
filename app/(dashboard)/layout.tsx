import { requireAuth } from '@/lib/auth'
import { getUserClient } from '@/lib/auth-guard'
import { GoogleReauthBanner } from '@/components/google-reauth-banner'
import { Sidebar } from '@/components/sidebar'
import { getEnvTier } from '@/lib/env'
import { Toaster } from '@/components/ui/sonner'
import { ThemeToggle } from '@/components/theme-toggle'
import { isBackfillEnabled } from './rozlicz-w-przeszlosci/actions'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()
  const showBackfill = await isBackfillEnabled()
  const { supabase } = await getUserClient()
  // Baner tylko dla konta w stanie needs_reauth (RLS: widać wyłącznie własny wiersz); błąd odczytu nie psuje strony.
  const { data: google } = await supabase.from('google_connections').select('status').maybeSingle()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isProduction={getEnvTier() === 'PRODUCTION'} showBackfill={showBackfill} />
      <main className="flex-1 overflow-y-auto bg-background">
        {google?.status === 'needs_reauth' && <GoogleReauthBanner />}
        {children}
      </main>
      <Toaster />
      <ThemeToggle />
    </div>
  )
}
