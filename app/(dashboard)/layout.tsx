import { requireAuth } from '@/lib/auth'
import { Sidebar } from '@/components/sidebar'
import { getEnvTier } from '@/lib/env'
import { Toaster } from '@/components/ui/sonner'
import { ThemeToggle } from '@/components/theme-toggle'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isProduction={getEnvTier() === 'PRODUCTION'} />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
      <Toaster />
      <ThemeToggle />
    </div>
  )
}
