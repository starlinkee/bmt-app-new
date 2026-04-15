'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

interface MonthYearPickerProps {
  month: number
  year: number
  onMonthChange: (month: number) => void
  onYearChange: (year: number) => void
}

export function MonthYearPicker({
  month,
  year,
  onMonthChange,
  onYearChange,
}: MonthYearPickerProps) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  return (
    <div className="flex gap-2">
      <Select
        value={String(month)}
        onValueChange={(v) => onMonthChange(Number(v))}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((name, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={String(year)}
        onValueChange={(v) => onYearChange(Number(v))}
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
