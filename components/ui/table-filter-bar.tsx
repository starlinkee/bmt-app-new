'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface FilterColumn {
  key: string
  label: string
}

interface TableFilterBarProps {
  value: string
  onChange: (v: string) => void
  column?: string
  onColumnChange?: (col: string) => void
  columns?: FilterColumn[]
  placeholder?: string
  hideColumns?: boolean
}

export function TableFilterBar({
  value,
  onChange,
  column = '__all__',
  onColumnChange,
  columns = [],
  placeholder = 'Szukaj...',
  hideColumns = false,
}: TableFilterBarProps) {
  return (
    <div className="flex gap-2 items-center">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-8 pr-8"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full w-8 hover:bg-transparent"
            onClick={() => onChange('')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {!hideColumns && onColumnChange && columns.length > 0 && (
        <Select value={column} onValueChange={(v) => onColumnChange(v ?? '__all__')}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {column === '__all__'
                ? 'Wszystkie kolumny'
                : (columns.find((c) => c.key === column)?.label ?? column)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Wszystkie kolumny</SelectItem>
            {columns.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
