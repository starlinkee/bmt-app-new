'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { use } from 'react'
import { getSettlementGroup, getPreviousMeterReadings, processSettlement } from '../actions'
import { MonthYearPicker } from '@/components/month-year-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatAmount } from '@/lib/utils'

type Group = Awaited<ReturnType<typeof getSettlementGroup>>
type FieldDef = string | { range: string; source: 'user' | 'db' | 'auto'; save_key?: string; db_key?: string; auto_type?: 'billing_period' | 'current_date' | 'previous_date' }

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
  const [editedPreviousReadings, setEditedPreviousReadings] = useState<Record<string, string>>({})
  const [results, setResults] = useState<{ tenantName: string; amount: number; invoiceNumber: string }[]>([])
  const [progress, setProgress] = useState(0)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const g = await getSettlementGroup(Number(groupId))
      setGroup(g)
    })
  }, [groupId])

  useEffect(() => {
    if (!group) return
    startTransition(async () => {
      const prev = await getPreviousMeterReadings(Number(groupId), month, year)
      setPreviousReadings(prev)
      setEditedPreviousReadings({})
    })
  }, [groupId, group, month, year])

  useEffect(() => {
    if (!group) return
    const inputMapping = (group.input_mapping_json as Record<string, Record<string, FieldDef>>) ?? {}
    const autoVals = computeAutoValues(month, year, inputMapping)
    if (Object.keys(autoVals).length === 0) return
    setInputValues(prev => ({ ...prev, ...autoVals }))
  }, [month, year, group])

  const inputMapping = (group?.input_mapping_json as Record<string, Record<string, FieldDef>>) ?? {}

  function getReadingError(range: string, saveKey: string | undefined): boolean {
    if (saveKey === undefined) return false
    const currentRaw = inputValues[range]
    const prevRaw = saveKey in editedPreviousReadings ? editedPreviousReadings[saveKey] : previousReadings[saveKey] !== undefined ? String(previousReadings[saveKey]) : undefined
    if (currentRaw === undefined || currentRaw === '' || prevRaw === undefined || prevRaw === '') return false
    const current = parseFloat(currentRaw.replace(',', '.'))
    const prev = parseFloat(prevRaw.replace(',', '.'))
    return !isNaN(current) && !isNaN(prev) && current < prev
  }

  function handleProcess() {
    setProgress(0)
    const interval = setInterval(() => {
      setProgress((p) => {
        const delta = (95 - p) * 0.05
        return Math.min(p + delta, 94)
      })
    }, 200)

    const hasReadingErrors = Object.entries(inputMapping).some(([, fields]) =>
      Object.entries(fields).some(([, fieldDef]) => {
        const range = typeof fieldDef === 'string' ? fieldDef : fieldDef.range
        const saveKey = typeof fieldDef !== 'string' && fieldDef.source === 'user' ? fieldDef.save_key : undefined
        return getReadingError(range, saveKey)
      })
    )
    if (hasReadingErrors) {
      clearInterval(interval)
      setProgress(0)
      toast.error('Aktualny odczyt nie może być mniejszy od poprzedniego.')
      return
    }

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
        toast.success(`Rozliczono. Wystawiono ${res.length} rachunków.`)
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
              const isAuto = source === 'auto' || detectAutoType(fieldLabel) !== null
              const saveKey = typeof fieldDef !== 'string' && fieldDef.source === 'user' ? fieldDef.save_key : undefined
              const lastReading = saveKey !== undefined
                ? (saveKey in editedPreviousReadings ? editedPreviousReadings[saveKey] : previousReadings[saveKey] !== undefined ? String(previousReadings[saveKey]) : undefined)
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

      <Button onClick={handleProcess} disabled={pending}>
        Przelicz i wystaw
      </Button>

      {pending && progress > 0 && (
        <div className="space-y-1 max-w-sm">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Wystawione rachunki</h2>
          <ul className="space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.invoiceNumber ?? r.tenantName}>
                {r.invoiceNumber && <span className="font-mono">{r.invoiceNumber}</span>}
                {r.invoiceNumber && ' — '}
                {r.tenantName} — {formatAmount(r.amount)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
