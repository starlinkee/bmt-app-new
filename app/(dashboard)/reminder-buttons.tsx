'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { BellRing, Building2, Zap } from 'lucide-react'
import { sendReminders, type OperationKey } from './reminder-actions'

function formatCallTime(iso: string | null): string {
  if (!iso) return 'nigdy'
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

type Props = {
  lastOps: Record<OperationKey, string | null>
  gmailAccount1: string | null
  gmailAccount2: string | null
}

export function ReminderButtons({ lastOps, gmailAccount1, gmailAccount2 }: Props) {
  const router = useRouter()
  const [loadingPrivate, setLoadingPrivate] = useState(false)
  const [loadingBmt, setLoadingBmt] = useState(false)
  const [lastPrivate, setLastPrivate] = useState(lastOps.reminders_private)
  const [lastBmt, setLastBmt] = useState(lastOps.reminders_bmt)

  async function handlePrivate() {
    setLoadingPrivate(true)
    try {
      const { sent, skipped } = await sendReminders('PRIVATE')
      setLastPrivate(new Date().toISOString())
      toast.success(`Prywatne: wysłano ${sent}, pominięto ${skipped}`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd wysyłki')
      router.refresh()
    } finally {
      setLoadingPrivate(false)
    }
  }

  async function handleBmt() {
    setLoadingBmt(true)
    try {
      const { sent, skipped } = await sendReminders('BMT')
      setLastBmt(new Date().toISOString())
      toast.success(`BMT: wysłano ${sent}, pominięto ${skipped}`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd wysyłki')
      router.refresh()
    } finally {
      setLoadingBmt(false)
    }
  }

  const busy = loadingPrivate || loadingBmt

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Operacje</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">

        <button
          onClick={handlePrivate}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed min-h-[160px] cursor-pointer"
        >
          <BellRing className="h-10 w-10 text-primary" strokeWidth={1.5} />
          <div className="text-center space-y-0.5">
            <p className="font-semibold text-sm leading-tight">
              {loadingPrivate ? 'Wysyłanie…' : 'Przypomnienia prywatne'}
            </p>
            <p className="text-xs text-muted-foreground truncate max-w-[130px]">
              {gmailAccount2 ?? '— brak konta —'}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCallTime(lastPrivate)}
            </p>
          </div>
        </button>

        <button
          onClick={handleBmt}
          disabled={busy}
          className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed min-h-[160px] cursor-pointer"
        >
          <Building2 className="h-10 w-10 text-primary" strokeWidth={1.5} />
          <div className="text-center space-y-0.5">
            <p className="font-semibold text-sm leading-tight">
              {loadingBmt ? 'Wysyłanie…' : 'Przypomnienia BMT'}
            </p>
            <p className="text-xs text-muted-foreground truncate max-w-[130px]">
              {gmailAccount1 ?? '— brak konta —'}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCallTime(lastBmt)}
            </p>
          </div>
        </button>

        <Link
          href="/media"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground min-h-[160px]"
        >
          <Zap className="h-10 w-10 text-primary" strokeWidth={1.5} />
          <div className="text-center space-y-0.5">
            <p className="font-semibold text-sm leading-tight">Media</p>
            <p className="text-xs text-muted-foreground">Rozliczenia mediów</p>
          </div>
        </Link>

      </div>
    </div>
  )
}
