'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Wspólny wybór miesiąca/roku dla zakładek z danymi historycznymi
// (Rozlicz w przeszłości, Media w przeszłości) - 10 lat wstecz.

export const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]
export const MONTH_ITEMS = MONTHS.map((label, i) => ({ value: String(i + 1), label }))

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 11 }, (_, i) => currentYear - 10 + i)

export function MonthYearSelect({
  label,
  month,
  year,
  onChange,
}: {
  label: string
  month: number
  year: number
  onChange: (month: number, year: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        <Select items={MONTH_ITEMS} value={String(month)} onValueChange={(v) => onChange(Number(v), year)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_ITEMS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => onChange(month, Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
