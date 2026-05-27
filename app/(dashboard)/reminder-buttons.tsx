'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
}

export function ReminderButtons({ lastOps }: Props) {
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
    <Card>
      <CardHeader>
        <CardTitle>Operacje</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handlePrivate} disabled={busy} className="w-72">
            {loadingPrivate ? 'Wysyłanie...' : 'Wyślij przypomnienia (prywatne)'}
          </Button>
          <span className="text-sm text-muted-foreground">
            Ostatnio: {formatCallTime(lastPrivate)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={handleBmt} disabled={busy} className="w-72">
            {loadingBmt ? 'Wysyłanie...' : 'Wyślij przypomnienia (BMT)'}
          </Button>
          <span className="text-sm text-muted-foreground">
            Ostatnio: {formatCallTime(lastBmt)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
