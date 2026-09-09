'use client'

import { use, useEffect, useState, useTransition } from 'react'
import { getTenantReadingsContext, getTargetMonthYear, hasAlreadySubmitted, getPreviousMeterReadings, saveReadings } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LiveClock } from '@/components/live-clock'

const MONTHS = ['Stycznia', 'Lutego', 'Marca', 'Kwietnia', 'Maja', 'Czerwca', 'Lipca', 'Sierpnia', 'Września', 'Października', 'Listopada', 'Grudnia']

type TenantReadingEntry = { key: string; label: string }

// Wspiera stary format (klucze jako string[]) obok nowego ({key,label}[]).
function normalizeReadingEntries(raw: unknown): TenantReadingEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((e) =>
    typeof e === 'string' ? { key: e, label: e.replace(/_/g, ' ') } : { key: e.key, label: e.label || e.key.replace(/_/g, ' ') }
  )
}

export default function TenantReadingsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getTenantReadingsContext>>>(null)
  const [dateInfo, setDateInfo] = useState<{ month: number; year: number } | null>(null)
  const [submittedGroups, setSubmittedGroups] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<number, Record<string, string>>>({})
  const [previousReadings, setPreviousReadings] = useState<Record<number, Record<string, number>>>({})

  useEffect(() => {
    async function load() {
      const data = await getTenantReadingsContext(token)
      setCtx(data)
      const d = await getTargetMonthYear()
      setDateInfo(d)
      
      if (data && data.groups) {
        const statuses: Record<number, boolean> = {}
        const initVals: Record<number, Record<string, string>> = {}
        const prevReadings: Record<number, Record<string, number>> = {}
        for (const g of data.groups) {
          const trk = (g.tenant_reading_keys as Record<string, unknown>) || {}
          const entries = normalizeReadingEntries(trk[data.tenant.id.toString()])
          const keys = entries.map((e) => e.key)
          statuses[g.id] = await hasAlreadySubmitted(g.id, d.month, d.year, keys)
          prevReadings[g.id] = await getPreviousMeterReadings(g.id, d.month, d.year, keys)
          initVals[g.id] = {}
          for (const entry of entries) {
            initVals[g.id][entry.key] = ''
          }
        }
        setSubmittedGroups(statuses)
        setValues(initVals)
        setPreviousReadings(prevReadings)
      }
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) return <div className="p-8 text-center text-muted-foreground">Ładowanie...</div>
  
  if (!ctx || ctx.groups.length === 0) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <h1 className="text-xl font-bold">Brak odczytów</h1>
        <p className="text-muted-foreground">Nie znaleziono aktywnych formularzy dla tego linku.</p>
      </div>
    )
  }

  const monthName = dateInfo ? MONTHS[dateInfo.month - 1] : ''
  const year = dateInfo?.year

  function handleSubmit(groupId: number) {
    const groupVals = values[groupId]
    const hasEmpty = Object.values(groupVals).some(v => v.trim() === '')
    if (hasEmpty) {
      alert('Proszę wypełnić wszystkie pola odczytów przed wysłaniem.')
      return
    }

    startTransition(async () => {
      await saveReadings(groupId, dateInfo!.month, dateInfo!.year, groupVals)
      setSubmittedGroups(prev => ({ ...prev, [groupId]: true }))
    })
  }

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col items-center p-4 py-12 relative">
      <div className="absolute top-4 left-4">
        <LiveClock />
      </div>
      <div className="w-full max-w-md space-y-6">
        
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Podaj odczyty liczników</h1>
          <p className="text-muted-foreground text-sm">
            Najemca: <span className="font-semibold text-foreground">{ctx.tenant.name}</span>
          </p>
          {dateInfo && (
            <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold bg-primary/10 text-primary mt-2">
              Okres: odczyt na koniec {monthName} {year}
            </div>
          )}
        </div>

        {ctx.groups.map(group => {
          const isSubmitted = submittedGroups[group.id]
          
          if (isSubmitted) {
            return (
              <div key={group.id} className="bg-card rounded-xl border p-6 text-center space-y-3 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl mb-4">
                  ✓
                </div>
                <h3 className="font-semibold">{group.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Dziękujemy, Twoje odczyty za ten miesiąc zostały już zapisane. Kolejne odczyty będziesz mógł podać pod koniec następnego miesiąca.
                </p>
              </div>
            )
          }

          return (
            <div key={group.id} className="bg-card rounded-xl border p-6 space-y-5 shadow-sm">
              <h3 className="font-semibold border-b pb-3">{group.name}</h3>
              
              <div className="space-y-4">
                {normalizeReadingEntries((group.tenant_reading_keys as Record<string, unknown>)?.[ctx.tenant.id.toString()]).map((entry) => {
                  const prevValue = previousReadings[group.id]?.[entry.key]
                  return (
                    <div key={entry.key} className="space-y-2">
                      <Label className="text-sm font-medium">{entry.label}</Label>
                      <p className="text-xs text-muted-foreground">
                        {prevValue !== undefined
                          ? `Poprzedni odczyt: ${prevValue}`
                          : 'Brak poprzedniego odczytu w systemie'}
                      </p>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={values[group.id]?.[entry.key] || ''}
                        onChange={e => setValues({
                          ...values,
                          [group.id]: {
                            ...values[group.id],
                            [entry.key]: e.target.value
                          }
                        })}
                        className="text-lg"
                      />
                    </div>
                  )
                })}
              </div>

              <Button 
                className="w-full" 
                size="lg"
                disabled={pending}
                onClick={() => handleSubmit(group.id)}
              >
                {pending ? 'Zapisywanie...' : 'Wyślij odczyty'}
              </Button>
            </div>
          )
        })}
        
      </div>
    </div>
  )
}
