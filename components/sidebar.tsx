'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  CreditCard,
  Gauge,
  Upload,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/login/actions'

const navItems = [
  { href: '/', label: 'Strona główna', icon: LayoutDashboard },
  { href: '/properties', label: 'Nieruchomości', icon: Building2 },
  { href: '/tenants', label: 'Najemcy', icon: Users },
  { href: '/contracts', label: 'Umowy', icon: FileText },
  { href: '/finance', label: 'Finanse', icon: CreditCard },
  { href: '/media', label: 'Media', icon: Gauge },
  { href: '/import', label: 'Import CSV', icon: Upload },
  { href: '/settings', label: 'Ustawienia', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-[oklch(0.93_0_0)]" style={{ fontSize: '115%' }}>
      <div className="flex h-14 items-center border-b px-4">
        <span className="font-semibold tracking-tight">BMT Nieruchomości</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5 px-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-t p-2">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Wyloguj się
          </button>
        </form>
      </div>
    </aside>
  )
}
