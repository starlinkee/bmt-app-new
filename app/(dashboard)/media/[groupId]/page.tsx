/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { use } from 'react'
import { getSettlementGroup, getPreviousMeterReadings, getCurrentMeterReadings, processSettlement, getMediaEmailPreview, getSettlementForMonth } from '../actions'
import { MonthYearPicker } from '@/components/month-year-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatAmount } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

type Group = Awaited<ReturnType<typeof getSettlementGroup>>
type FieldDef = string | { range: string; source: 'user' | 'db' | 'auto'; save_key?: string; db_key?: string; auto_type?: 'billing_period' | 'current_date' | 'previous_date' | 'property_address' }

function lastDayOfMonth(year: number, month: number): string {
  // JS Date(y, m, 0) = last day of month (m-1) in 1-indexed terms; handles negative/overflow months correctly
  const d = new Date(year, month, 0)
  const day = String(d.getDate()).padStart(2, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${m}.${d.getFullYear()}`
}

function detectAutoType(label: string): 'billing_period' | 'current_date' | 'previous_date' | null {
  const l = label.toLowerCase()
  if (l.includes('okres rozliczeniowy')) return 'billing_period'
  if (l.includes('aktualna data') || l.includes('data aktualna')) return 'current_date'
  if (l.includes('poprzednia data') || l.includes('data poprzednia')) return 'previous_date'
  return null
}

function computeAutoValues(month: number, year: number, inputMapping: Record<string, Record<string, FieldDef>>): Record<string, string> {
  const auto: Record<string, string> = {}
  for (const fields of Object.values(inputMapping)) {
    for (const [label, fieldDef] of Object.entries(fields)) {
      const range = typeof fieldDef === 'string' ? fieldDef : fieldDef.range
      const source = typeof fieldDef === 'string' ? 'user' : fieldDef.source
      if (source === 'db') continue

      // explicit auto_type in JSON takes priority, otherwise detect by label
      let autoType: string | null = null
      if (typeof fieldDef !== 'string' && fieldDef.source === 'auto' && fieldDef.auto_type) {
        autoType = fieldDef.auto_type
      } else {
        autoType = detectAutoType(label)
      }

      if (autoType === 'billing_period') {
        auto[range] = `${String(month).padStart(2, '0')}/${year}`
      } else if (autoType === 'current_date') {
        auto[range] = lastDayOfMonth(year, month - 1)
      } else if (autoType === 'previous_date') {
        auto[range] = lastDayOfMonth(year, month - 2)
      }
    }
  }
  return auto
}

export default function MediaGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = use(params)
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [group, setGroup] = useState<Group | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [previousReadings, setPreviousReadings] = useState<Record<string, number>>({})
  const [currentReadings, setCurrentReadings] = useState<Record<string, number>>({})
  const [editedPreviousReadings, setEditedPreviousReadings] = useState<Record<string, string>>({})
  const [settlementExists, setSettlementExists] = useState(false)
  const [readingsLoaded, setReadingsLoaded] = useState(false)
  const [results, setResults] = useState<{ tenantName: string; amount: number; invoiceNumber: string | null; invoiceError?: string; emailError?: string }[]>([])
  const [progress, setProgress] = useState(0)
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [emailPreview, setEmailPreview] = useState<Awaited<ReturnType<typeof getMediaEmailPreview>> | null>(null)

  useEffect(() => {
    startTransition(async () => {
      const g = await getSettlementGroup(Number(groupId))
      setGroup(g)
    })
  }, [groupId])

  useEffect(() => {
    if (!group) return
    setReadingsLoaded(false)
    setInputValues({}) // Reset inputs when month/year changes to prevent bleeding
    startTransition(async () => {
      const [prev, exists, current] = await Promise.all([
        getPreviousMeterReadings(Number(groupId), month, year),
        getSettlementForMonth(Number(groupId), month, year),
        getCurrentMeterReadings(Number(groupId), month, year),
      ])
      setPreviousReadings(prev)
      setCurrentReadings(current)
      setEditedPreviousReadings({})
      setSettlementExists(exists)
      setReadingsLoaded(true)
    })
  }, [groupId, group, month, year])

  useEffect(() => {
    if (!group) return
    const inputMapping = (group.input_mapping_json as Record<string, Record<string, FieldDef>>) ?? {}
    const autoVals = computeAutoValues(month, year, inputMapping)
    
    const prepopulated: Record<string, string> = {}
    if (readingsLoaded) {
      for (const fields of Object.values(inputMapping)) {
        for (const [, fieldDef] of Object.entries(fields)) {
          if (typeof fieldDef !== 'string' && fieldDef.source === 'user' && fieldDef.save_key) {
             if (currentReadings[fieldDef.save_key] !== undefined) {
               prepopulated[fieldDef.range] = String(currentReadings[fieldDef.save_key])
             }
          }
        }
      }
    }
    
    if (Object.keys(autoVals).length === 0 && Object.keys(prepopulated).length === 0) return
    setInputValues(prev => ({ ...prev, ...autoVals, ...prepopulated }))
  }, [month, year, group, currentReadings, readingsLoaded])

  const inputMapping = (group?.input_mapping_json as Record<string, Record<string, FieldDef>>) ?? {}

  const hasMeterFields = Object.values(inputMapping).some(fields =>
    Object.values(fields).some(f => typeof f !== 'string' && (f as { source: string }).source === 'user' && !!(f as { save_key?: string }).save_key)
  )
  const noPreviousReadings = readingsLoaded && hasMeterFields && Object.keys(previousReadings).length === 0

  function getReadingError(range: string, saveKey: string | undefined): boolean {
    if (saveKey === undefined) return false
    const currentRaw = inputValues[range]
    const prevRaw = saveKey in editedPreviousReadings ? editedPreviousReadings[saveKey] : previousReadings[saveKey] !== undefined ? String(previousReadings[saveKey]) : undefined
    if (currentRaw === undefined || currentRaw === '' || prevRaw === undefined || prevRaw === '') return false
    const current = parseFloat(currentRaw.replace(',', '.'))
    const prev = parseFloat(prevRaw.replace(',', '.'))
    return !isNaN(current) && !isNaN(prev) && current < prev
  }

  function handleOpenConfirm() {
    const emptyUserFields: string[] = []
    for (const [, fields] of Object.entries(inputMapping)) {
      for (const [fieldLabel, fieldDef] of Object.entries(fields)) {
        const range = typeof fieldDef === 'string' ? fieldDef : fieldDef.range
        const source = typeof fieldDef === 'string' ? 'user' : fieldDef.source
        if (source !== 'user') continue
        if (!inputValues[range] || inputValues[range].trim() === '') {
          emptyUserFields.push(fieldLabel)
        }
      }
    }
    if (emptyUserFields.length > 0) {
      toast.error(`Uzupełnij wszystkie pola przed zapisaniem: ${emptyUserFields.join(', ')}`)
      return
    }

    const hasReadingErrors = Object.entries(inputMapping).some(([, fields]) =>
      Object.entries(fields).some(([, fieldDef]) => {
        const range = typeof fieldDef === 'string' ? fieldDef : fieldDef.range
        const saveKey = typeof fieldDef !== 'string' && fieldDef.source === 'user' ? fieldDef.save_key : undefined
        return getReadingError(range, saveKey)
      })
    )
    if (hasReadingErrors) {
      toast.error('Aktualny odczyt nie może być mniejszy od poprzedniego.')
      return
    }

    startTransition(async () => {
      const preview = await getMediaEmailPreview(Number(groupId))
      setEmailPreview(preview)
      setConfirmOpen(true)
    })
  }

  function handleProcess() {
    setConfirmOpen(false)
    setProgress(0)
    const interval = setInterval(() => {
      setProgress((p) => {
        const delta = (95 - p) * 0.05
        return Math.min(p + delta, 94)
      })
    }, 200)

    startTransition(async () => {
      try {
        const res = await processSettlement(
          Number(groupId),
          inputValues,
          month,
          year,
          editedPreviousReadings,
        )
        clearInterval(interval)
        setProgress(100)
        setResults(res)
        toast.success(`Rozliczono. Zapisano ${res.length} obciążeń.`)
      } catch (e) {
        clearInterval(interval)
        setProgress(0)
        toast.error(e instanceof Error ? e.message : 'Nieznany błąd')
      }
    })
  }

  if (!group) {
    return <div className="p-6 text-muted-foreground">Ładowanie...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Media — {group.name}</h1>
      </div>

      {noPreviousReadings && (
        <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          Brak poprzednich odczytów w bazie danych — wprowadź poprzedni stan licznika ręcznie.
        </div>
      )}

      {settlementExists && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
          Media za {month}/{year} zostały już wystawione dla tej grupy.
        </div>
      )}

      <div className="flex items-center gap-4">
        <MonthYearPicker
          month={month}
          year={year}
          onMonthChange={setMonth}
          onYearChange={setYear}
        />
      </div>

      <div className="space-y-6 max-w-xl">
        {Object.entries(inputMapping).map(([groupLabel, fields]) => (
          <div key={groupLabel} className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              {groupLabel}
            </h2>
            {Object.entries(fields).map(([fieldLabel, fieldDef]) => {
              const range = typeof fieldDef === 'string' ? fieldDef : fieldDef.range
              const source = typeof fieldDef === 'string' ? 'user' : fieldDef.source
              if (source === 'db') return null
              if (source === 'auto' && typeof fieldDef !== 'string' && fieldDef.auto_type === 'property_address') {
                const firstProp = (group.settlement_group_properties as { property_id: number; properties: { name: string; address1?: string | null; address2?: string | null } | null }[])[0]?.properties
                const addr = firstProp ? [firstProp.address2, firstProp.address1].filter(Boolean).join(', ') : '—'
                return (
                  <div key={range} className="space-y-1">
                    <Label>{fieldLabel}</Label>
                    <Input value={addr} readOnly className="bg-muted text-muted-foreground cursor-default" />
                  </div>
                )
              }
              const isAuto = source === 'auto' || detectAutoType(fieldLabel) !== null
              const saveKey = typeof fieldDef !== 'string' && fieldDef.source === 'user' ? fieldDef.save_key : undefined
              const lastReading = saveKey !== undefined
                ? (saveKey in editedPreviousReadings ? editedPreviousReadings[saveKey] : previousReadings[saveKey] !== undefined ? String(previousReadings[saveKey]) : '')
                : undefined
              const hasError = getReadingError(range, saveKey)
              return (
                <div key={range} className="space-y-1">
                  <Label>{fieldLabel}</Label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 space-y-1">
                    <Input
                      value={inputValues[range] ?? ''}
                      onChange={(e) =>
                        setInputValues({ ...inputValues, [range]: e.target.value })
                      }
                      placeholder={isAuto ? '' : '0'}
                      readOnly={isAuto}
                      className={isAuto ? 'bg-muted text-muted-foreground cursor-default' : hasError ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    {hasError && (
                      <p className="text-xs text-destructive">Aktualny odczyt nie może być mniejszy od poprzedniego.</p>
                    )}
                    </div>
                    {lastReading !== undefined && (
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <span className="text-xs text-muted-foreground">Poprzedni odczyt</span>
                        <Input
                          value={lastReading}
                          onChange={(e) =>
                            setEditedPreviousReadings(prev => ({ ...prev, [saveKey!]: e.target.value }))
                          }
                          className="w-32"
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Button onClick={handleOpenConfirm} disabled={pending}>
        Przelicz i zapisz
      </Button>


      {results.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Utworzone obciążenia</h2>
          <ul className="space-y-1 text-sm">
            {results.map((r, i) => (
              <li key={i} className="space-y-0.5">
                <div>
                  {r.tenantName} — {formatAmount(r.amount)}
                </div>
                {r.invoiceError && (
                  <div className="text-xs text-destructive pl-1">
                    Błąd obciążenia: {r.invoiceError}
                  </div>
                )}
                {r.emailError && (
                  <div className="text-xs text-amber-600 pl-1">
                    Błąd wysyłki e-mail: {r.emailError}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdzenie — {month}/{year}</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            {(emailPreview?.total ?? 0) === 0 ? (
              <p className="text-muted-foreground">Brak najemców z adresem e-mail — obciążenia zostaną zapisane bez wysyłki.</p>
            ) : (
              <>
                <p>Zostaną wysłane <strong>{emailPreview?.total}</strong> wiadomości e-mail:</p>
                <ul className="space-y-2 text-muted-foreground">
                  {(emailPreview?.entries ?? []).map((e, i) => (
                    <li key={i} className="space-y-0.5">
                      <div>{e.count} {e.count === 1 ? 'mail' : 'maile'} z: <span className="font-mono">{e.email ?? '—'}</span></div>
                      <div className="pl-3 text-xs">
                        Do: {e.recipients.map((r, j) => (
                          <span key={j}><span className="font-mono">{r}</span>{j < e.recipients.length - 1 ? ', ' : ''}</span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleProcess} disabled={pending}>
              Przelicz i zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pending && progress > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-3 px-8">
            <p className="text-center text-sm font-medium">Przetwarzanie...</p>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">{Math.round(progress)}%</p>
          </div>
        </div>
      )}
    </div>
  )
}
