'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  Users,
  FileText,
  Gauge,
  Upload,
  Settings,
  LogOut,
  ClipboardList,
  ArrowLeftRight,
  History,
  Bot,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/login/actions'

const dataItems = [
  { href: '/contracts', label: 'Umowy', icon: FileText },
  { href: '/properties', label: 'Nieruchomości', icon: Building2 },
  { href: '/tenants', label: 'Najemcy', icon: Users },
  { href: '/przeplywy', label: 'Przepływy', icon: ArrowLeftRight },
  { href: '/wiadomosci', label: 'Dziennik wiad.', icon: Mail },
  { href: '/audit', label: 'Historia operacji', icon: History },
]

const actionItems = [
  { href: '/kontrola-platnosci', label: 'Kontrola płatności', icon: ClipboardList },
  { href: '/media', label: 'Rozlicz media', icon: Gauge },
  { href: '/import', label: 'Import CSV', icon: Upload },
]

function NavItem({ href, label, icon: Icon, pathname }: { href: string, label: string, icon: any, pathname: string }) {
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
  return (
    <li>
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
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-sidebar" style={{ fontSize: '115%' }}>
      <Link href="/" className="flex h-14 items-center border-b px-4 hover:bg-accent/50 transition-colors">
        <span className="font-semibold tracking-tight">BMT Nieruchomości</span>
      </Link>
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Akcje
        </div>
        <ul className="space-y-0.5 px-2 mb-4">
          {actionItems.map((item) => (
            <NavItem key={item.href} {...item} pathname={pathname} />
          ))}
        </ul>
        <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Dane
        </div>
        <ul className="space-y-0.5 px-2">
          {dataItems.map((item) => (
            <NavItem key={item.href} {...item} pathname={pathname} />
          ))}
        </ul>
      </nav>
      <div className="border-t p-2 space-y-0.5">
        <Link
          href="/settings"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Ustawienia
        </Link>
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
