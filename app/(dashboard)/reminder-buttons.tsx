'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { sendReminders } from './reminder-actions'

export function ReminderButtons() {
  const [loading, setLoading] = useState(false)

  async function handlePrivate() {
    setLoading(true)
    try {
      const { sent, skipped } = await sendReminders('PRIVATE')
      toast.success(`Wysłano ${sent}, pominięto ${skipped}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Błąd wysyłki')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handlePrivate} disabled={loading}>
      {loading ? 'Wysyłanie...' : 'Wyślij przypomnienia (prywatne)'}
    </Button>
  )
}
