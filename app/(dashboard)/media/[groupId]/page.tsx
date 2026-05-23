'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { use } from 'react'
import { getSettlementGroup, processSettlement } from '../actions'
import { MonthYearPicker } from '@/components/month-year-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatAmount } from '@/lib/utils'

type Group = Awaited<ReturnType<typeof getSettlementGroup>>

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
  const [results, setResults] = useState<{ tenantName: string; amount: number; invoiceNumber: string }[]>([])
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const g = await getSettlementGroup(Number(groupId))
      setGroup(g)
    })
  }, [groupId])

  type FieldDef = string | { range: string; source: 'user' | 'db'; save_key?: string; db_key?: string }
  const inputMapping = (group?.input_mapping_json as Record<string, Record<string, FieldDef>>) ?? {}

  function handleProcess() {
    startTransition(async () => {
      try {
        const res = await processSettlement(
          Number(groupId),
          inputValues,
          month,
          year,
        )
        setResults(res)
        toast.success(`Rozliczono. Wystawiono ${res.length} rachunków.`)
      } catch (e) {
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

      <div className="space-y-6 max-w-sm">
        {Object.entries(inputMapping).map(([groupLabel, fields]) => (
          <div key={groupLabel} className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              {groupLabel}
            </h2>
            {Object.entries(fields).map(([fieldLabel, fieldDef]) => {
              const range = typeof fieldDef === 'string' ? fieldDef : fieldDef.range
              const source = typeof fieldDef === 'string' ? 'user' : fieldDef.source
              if (source === 'db') return null
              return (
                <div key={range} className="space-y-1">
                  <Label>{fieldLabel}</Label>
                  <Input
                    value={inputValues[range] ?? ''}
                    onChange={(e) =>
                      setInputValues({ ...inputValues, [range]: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Button onClick={handleProcess} disabled={pending}>
        Przelicz i wystaw
      </Button>

      {results.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">Wystawione rachunki</h2>
          <ul className="space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.invoiceNumber}>
                <span className="font-mono">{r.invoiceNumber}</span> —{' '}
                {r.tenantName} — {formatAmount(r.amount)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
