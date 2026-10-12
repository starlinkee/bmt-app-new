/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useState, useEffect, useRef } from 'react'
import { getTestClockState } from '@/app/(dashboard)/testowanie/actions'

// Ta sama reguła co isTestClockAllowed() w lib/clock.ts (nie importujemy tamtego
// modułu w kliencie - ciągnie klienta service role). Poza panelem testowym nie
// ma przesunięcia zegara, więc nie odpytujemy serwera (akcja wymaga sesji
// i rzuca błąd na produkcji oraz na publicznej stronie /odczyty).
const TEST_CLOCK_ALLOWED =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ALLOW_TEST_PANEL === 'true'

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isSimulated, setIsSimulated] = useState(false)
  const offsetRef = useRef(0)

  useEffect(() => {
    setMounted(true)

    const refreshOffset = () => {
      getTestClockState()
        .then(({ allowed, offsetMs }) => {
          offsetRef.current = allowed ? offsetMs : 0
          setIsSimulated(allowed && offsetMs !== 0)
        })
        .catch(() => {
          offsetRef.current = 0
          setIsSimulated(false)
        })
    }

    // Zegar ma "tykać" normalnie co sekundę (lokalnie, bez zapytań do
    // serwera), a przesunięcie (offset) odświeżamy rzadziej - np. gdy
    // ktoś zmieni je na /testowanie w innej karcie.
    const refreshInterval = TEST_CLOCK_ALLOWED ? setInterval(refreshOffset, 15000) : null
    if (TEST_CLOCK_ALLOWED) refreshOffset()
    const tickInterval = setInterval(() => {
      setNow(new Date(Date.now() + offsetRef.current))
    }, 1000)

    return () => {
      if (refreshInterval) clearInterval(refreshInterval)
      clearInterval(tickInterval)
    }
  }, [])

  if (!mounted || !now) return null

  const dateStr = now.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeStr = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (isSimulated) {
    return (
      <div className="bg-blue-100/90 text-blue-800 text-[11px] px-2 py-1 rounded shadow-sm flex w-fit items-center gap-1.5 backdrop-blur-sm">
        <span>⚠️ Symulacja: {dateStr} {timeStr}</span>
      </div>
    )
  }

  return (
    <div className="bg-background/50 text-muted-foreground text-[11px] px-2 py-1 rounded flex w-fit items-center gap-1.5 backdrop-blur-sm">
      <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
      <span className="font-mono">
        {dateStr} {timeStr}
      </span>
    </div>
  )
}
