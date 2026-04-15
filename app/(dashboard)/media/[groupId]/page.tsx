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

  const inputMapping = (group?.input_mapping_json as Record<string, string>) ?? {}

  function handleProcess() {
    startTransition(async () => {
      const res = await processSettlement(
        Number(groupId),
        inputValues,
        month,
        year,
      )
      setResults(res)
      toast.success(`Rozliczono. Wystawiono ${res.length} rachunków.`)
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

      <div className="space-y-3 max-w-sm">
        {Object.keys(inputMapping).map((label) => (
          <div key={label} className="space-y-1">
            <Label>{label}</Label>
            <Input
              value={inputValues[label] ?? ''}
              onChange={(e) =>
                setInputValues({ ...inputValues, [label]: e.target.value })
              }
              placeholder="0"
            />
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
