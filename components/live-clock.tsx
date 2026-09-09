/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useState, useEffect } from 'react'

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)
  const [simulatedDate, setSimulatedDate] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)

    // Tylko na dev lub gdy dopuszczono test panel
    const isOverrideAllowed = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ALLOW_TEST_PANEL === 'true'

    const readTestDate = () => {
      if (!isOverrideAllowed) return null
      const match = document.cookie.split('; ').find(row => row.startsWith('bmt_test_date='))
      return match ? match.split('=')[1] : null
    }

    // Sidebar (a razem z nim ten komponent) jest trwałym layoutem i nie
    // remontuje się przy nawigacji klienckiej - dlatego cookie trzeba
    // sprawdzać cyklicznie, a nie tylko raz przy montowaniu, żeby zmiana
    // (lub reset) symulowanej daty na /testowanie od razu było widoczne.
    const tick = () => {
      const testDate = readTestDate()
      setSimulatedDate(testDate)
      setNow(testDate ? new Date(testDate) : new Date())
    }

    tick()
    const interval = setInterval(tick, 1000)

    return () => clearInterval(interval)
  }, [])

  if (!mounted || !now) return null

  const dateStr = now.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeStr = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (simulatedDate) {
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
