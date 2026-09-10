'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Beaker, AlertTriangle, FileText, CheckCircle2, ArrowRight } from 'lucide-react'
import { getSettlementGroups } from '@/app/(dashboard)/media/actions'
import {
  generateTestMediaCharge,
  getGroupDetailsForTest,
  getTestClockState,
  setTestClock,
  resetTestClock,
  runLateRemindersTest,
  runStatementReminderTest,
} from './actions'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'

export default function TestowaniePage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; generated?: number; error?: string } | null>(null)
  
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  
  const [groupDetails, setGroupDetails] = useState<{ properties: any[], tenants: any[] } | null>(null)
  const [tenantAmounts, setTenantAmounts] = useState<Record<string, string>>({})

  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaResult, setMediaResult] = useState<{ success?: boolean; generated?: number; error?: string } | null>(null)

  const [mediaMonth, setMediaMonth] = useState(new Date().getMonth() + 1)
  const [mediaYear, setMediaYear] = useState(new Date().getFullYear())

  // Wirtualny zegar - offsetMs trzymany w bazie (app_config.time_offset_ms),
  // a wyświetlany czas tyka lokalnie co sekundę, żeby było widać, że czas
  // "płynie", tylko przesunięty (patrz lib/clock.ts).
  const [clockAllowed, setClockAllowed] = useState(true)
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [clockNow, setClockNow] = useState<Date | null>(null)
  const [clockInput, setClockInput] = useState('')
  const [clockLoading, setClockLoading] = useState(false)
  const [clockError, setClockError] = useState<string | null>(null)

  const [lateLoading, setLateLoading] = useState(false)
  const [lateResult, setLateResult] = useState<{ sent?: number; skipped?: number; reason?: string; error?: string } | null>(null)

  const [stmtLoading, setStmtLoading] = useState(false)
  const [stmtResult, setStmtResult] = useState<{ sent?: boolean; reason?: string; error?: string } | null>(null)

  useEffect(() => {
    getSettlementGroups().then(setGroups).catch(console.error)
  }, [])

  const refreshClockState = () => {
    getTestClockState().then(({ allowed, offsetMs }) => {
      setClockAllowed(allowed)
      setClockOffsetMs(offsetMs)
    }).catch(console.error)
  }

  useEffect(() => {
    refreshClockState()
    // Odświeżamy offset co jakiś czas (np. gdyby ktoś inny go zmienił),
    // a co sekundę tylko "dotykamy" lokalnie wyświetlany czas.
    const refreshInterval = setInterval(refreshClockState, 15000)
    const tickInterval = setInterval(() => {
      setClockOffsetMs((offset) => {
        setClockNow(new Date(Date.now() + offset))
        return offset
      })
    }, 1000)
    return () => {
      clearInterval(refreshInterval)
      clearInterval(tickInterval)
    }
  }, [])

  const handleSetClock = async () => {
    if (!clockInput) return
    setClockLoading(true)
    setClockError(null)
    try {
      const { offsetMs } = await setTestClock(clockInput)
      setClockOffsetMs(offsetMs)
    } catch (err: unknown) {
      setClockError(err instanceof Error ? err.message : 'Wystąpił błąd')
    } finally {
      setClockLoading(false)
    }
  }

  const handleResetClock = async () => {
    setClockLoading(true)
    setClockError(null)
    try {
      await resetTestClock()
      setClockOffsetMs(0)
    } catch (err: unknown) {
      setClockError(err instanceof Error ? err.message : 'Wystąpił błąd')
    } finally {
      setClockLoading(false)
    }
  }

  const handleRunLateReminders = async () => {
    setLateLoading(true)
    setLateResult(null)
    try {
      const res = await runLateRemindersTest()
      setLateResult(res)
    } catch (err: unknown) {
      setLateResult({ error: err instanceof Error ? err.message : 'Wystąpił błąd' })
    } finally {
      setLateLoading(false)
    }
  }

  const handleRunStatementReminder = async () => {
    setStmtLoading(true)
    setStmtResult(null)
    try {
      const res = await runStatementReminderTest()
      setStmtResult(res)
    } catch (err: unknown) {
      setStmtResult({ error: err instanceof Error ? err.message : 'Wystąpił błąd' })
    } finally {
      setStmtLoading(false)
    }
  }

  useEffect(() => {
    if (selectedGroup) {
      getGroupDetailsForTest(parseInt(selectedGroup)).then(details => {
        setGroupDetails(details)
        // Inicjalizujemy puste kwoty dla wszystkich najemców
        const initialAmounts: Record<string, string> = {}
        details?.tenants.forEach((t: any) => {
          initialAmounts[t.id] = ''
        })
        setTenantAmounts(initialAmounts)
      }).catch(console.error)
    } else {
      setGroupDetails(null)
      setTenantAmounts({})
    }
  }, [selectedGroup])

  const handleTestCron = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/cron/generate-rents?month=${month}&year=${year}`)
      const data = await res.json()
      
      if (res.ok) {
        setResult({ success: true, generated: data.generated })
      } else {
        setResult({ error: data.error || 'Wystąpił nieznany błąd' })
      }
    } catch (err: unknown) {
      setResult({ error: err instanceof Error ? err.message : 'Wystąpił błąd' })
    } finally {
      setLoading(false)
    }
  }

  const handleTestMediaCharge = async () => {
    if (!selectedGroup) return
    setMediaLoading(true)
    setMediaResult(null)
    try {
      // Konwersja tekstowych kwot na liczby (tylko dla tych, gdzie cokolwiek wpisano)
      const parsedAmounts: Record<string, number> = {}
      let hasAnyAmount = false
      
      Object.entries(tenantAmounts).forEach(([tenantId, amountStr]) => {
        if (amountStr.trim() !== '') {
          const val = parseFloat(amountStr.replace(',', '.'))
          if (!isNaN(val)) {
            parsedAmounts[tenantId] = val
            hasAnyAmount = true
          }
        }
      })

      if (!hasAnyAmount) {
        throw new Error('Musisz podać kwotę dla co najmniej jednego najemcy.')
      }

      const res = await generateTestMediaCharge(
        parseInt(selectedGroup),
        parsedAmounts,
        mediaMonth,
        mediaYear
      )
      setMediaResult({ success: true, generated: res.count })
    } catch (err: any) {
      setMediaResult({ error: err.message || 'Wystąpił błąd' })
    } finally {
      setMediaLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Beaker className="h-8 w-8" />
          Narzędzia Testowe
        </h1>
        <p className="text-muted-foreground mt-2">
          Ta zakładka jest widoczna tylko w środowisku deweloperskim lub na odpowiednio skonfigurowanym preview.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Wymuś generowanie czynszów (Cron Job)
          </CardTitle>
          <CardDescription>
            Symuluje działanie zadania CRON dla wybranego miesiąca i roku.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="month">Miesiąc (1-12)</Label>
              <Input 
                id="month" 
                type="number" 
                min={1} 
                max={12} 
                value={month} 
                onChange={(e) => setMonth(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Rok</Label>
              <Input 
                id="year" 
                type="number" 
                min={2000} 
                value={year} 
                onChange={(e) => setYear(parseInt(e.target.value))}
              />
            </div>
          </div>
          
          <Button
            onClick={handleTestCron}
            disabled={loading}
            className="w-full mt-2"
          >
            {loading ? 'Generowanie...' : `Wygeneruj czynsze dla ${month}/${year}`}
          </Button>

          {result?.error && (
            <div className="p-4 rounded-md mt-4 flex items-start gap-3 border border-red-200 dark:border-red-900/50">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Błąd</p>
                <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Wystaw testowe obciążenie (Media)
          </CardTitle>
          <CardDescription>
            Tworzy notę obciążeniową w bazie dla wszystkich aktualnych najemców w lokalach z wybranej grupy.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mediaMonth">Miesiąc (1-12)</Label>
              <Input 
                id="mediaMonth" 
                type="number" 
                min={1} 
                max={12} 
                value={mediaMonth} 
                onChange={(e) => setMediaMonth(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mediaYear">Rok</Label>
              <Input 
                id="mediaYear" 
                type="number" 
                min={2000} 
                value={mediaYear} 
                onChange={(e) => setMediaYear(parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Grupa rozliczeniowa</Label>
            <Select value={selectedGroup} onValueChange={(v) => setSelectedGroup(v || '')}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz grupę...">
                  {groups.find(g => g.id.toString() === selectedGroup)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {groupDetails && (
            <div className="space-y-4 border-t pt-4 mt-4">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
                  Najemcy z aktywną umową ({groupDetails.tenants.length})
                </Label>
                {groupDetails.tenants.length > 0 ? (
                  <div className="space-y-2">
                    {groupDetails.tenants.map(tenant => (
                      <div key={tenant.id} className="flex items-center gap-3 bg-secondary/30 p-2 rounded-md">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                            <span className="font-semibold truncate" title={tenant.propertyName}>{tenant.propertyName}</span>
                            <span className="text-muted-foreground hidden sm:inline">&bull;</span>
                            <span className="truncate font-medium" title={tenant.name}>{tenant.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate" title={tenant.propertyAddress}>
                            {tenant.propertyAddress || 'Brak adresu'}
                          </div>
                        </div>
                        <div className="w-28 shrink-0">
                          <Input 
                            type="number" 
                            step="0.01"
                            placeholder="Kwota"
                            value={tenantAmounts[tenant.id.toString()] ?? ''}
                            onChange={e => setTenantAmounts(prev => ({
                              ...prev,
                              [tenant.id.toString()]: e.target.value
                            }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-red-600 dark:text-red-400 italic">Nie znaleziono żadnych najemców z aktywną umową w tych lokalach.</p>
                )}
              </div>
            </div>
          )}

          <Button
            onClick={handleTestMediaCharge}
            disabled={mediaLoading || !selectedGroup || !groupDetails || groupDetails.tenants.length === 0}
            className="w-full mt-2"
          >
            {mediaLoading ? 'Wystawianie...' : `Wystaw obciążenia dla ${mediaMonth}/${mediaYear}`}
          </Button>

          {mediaResult?.error && (
            <div className="p-4 rounded-md mt-4 flex items-start gap-3 border border-red-200 dark:border-red-900/50">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5" />
              <div>
                <p className="font-medium">Błąd</p>
                <p className="text-sm text-red-600 dark:text-red-400">{mediaResult.error}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Wirtualny zegar
          </CardTitle>
          <CardDescription>
            Przesuwa czas widziany przez całą aplikację (w tym crony i linki do mediów dla najemców).
            Czas dalej normalnie płynie - tylko przesunięty względem rzeczywistego. Dzięki temu można
            np. ustawić 16. dzień miesiąca, godz. 8:00 i sprawdzić, czy automatyzacja się odpali.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {!clockAllowed ? (
            <p className="text-sm text-muted-foreground italic">Wirtualny zegar jest wyłączony na tym środowisku.</p>
          ) : (
            <>
              <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${clockOffsetMs !== 0 ? 'bg-blue-100/90 text-blue-800' : 'bg-secondary/40 text-muted-foreground'}`}>
                {clockOffsetMs !== 0 ? '⚠️ Symulacja aktywna — aktualnie: ' : 'Czas rzeczywisty — aktualnie: '}
                <span className="font-mono">
                  {clockNow ? clockNow.toLocaleString('pl-PL') : '...'}
                </span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clockInput">Ustaw datę i godzinę</Label>
                <Input
                  id="clockInput"
                  type="datetime-local"
                  value={clockInput}
                  onChange={(e) => setClockInput(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSetClock} disabled={clockLoading || !clockInput} className="flex-1">
                  {clockLoading ? 'Ustawianie...' : 'Ustaw symulowany czas'}
                </Button>
                <Button onClick={handleResetClock} disabled={clockLoading} variant="outline" className="flex-1">
                  Zresetuj do prawdziwego czasu
                </Button>
              </div>

              {clockError && (
                <p className="text-sm text-red-600 dark:text-red-400">{clockError}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Odpal automatyzacje pod symulowanym czasem
          </CardTitle>
          <CardDescription>
            Wywołuje logikę cronów bezpośrednio (bez czekania na Vercel Cron), licząc &quot;teraz&quot; z wirtualnego zegara powyżej.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Button onClick={handleRunStatementReminder} disabled={stmtLoading} variant="outline" className="w-full">
              {stmtLoading ? 'Wysyłanie...' : 'Odpal: przypomnienie o wgraniu wyciągu (16. dnia)'}
            </Button>
            {stmtResult && (
              <p className="text-sm mt-2 text-muted-foreground">
                {stmtResult.error ? <span className="text-red-600 dark:text-red-400">{stmtResult.error}</span>
                  : stmtResult.sent ? <span className="text-green-600 dark:text-green-500 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Wysłano</span>
                  : `Nie wysłano: ${stmtResult.reason}`}
              </p>
            )}
          </div>

          <div>
            <Button onClick={handleRunLateReminders} disabled={lateLoading} variant="outline" className="w-full">
              {lateLoading ? 'Wysyłanie...' : 'Odpal: ponaglenia dla zalegających najemców (od 15. dnia)'}
            </Button>
            {lateResult && (
              <p className="text-sm mt-2 text-muted-foreground">
                {lateResult.error ? <span className="text-red-600 dark:text-red-400">{lateResult.error}</span>
                  : lateResult.reason ? `Nie wysłano: ${lateResult.reason}`
                  : `Wysłano: ${lateResult.sent}, pominięto (już wysłane w tym miesiącu): ${lateResult.skipped}`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
