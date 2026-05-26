"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "./input"

export type SearchSelectOption = {
  value: string
  label: string
  description?: string
}

type Props = {
  options: SearchSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SearchSelect({ options, value, onValueChange, placeholder = "Wybierz...", className }: Props) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = query
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.description?.toLowerCase().includes(query.toLowerCase())
      )
    : options

  function handleFocus() {
    setFocused(true)
    setQuery("")
  }

  function handleClick() {
    setOpen(true)
    setQuery("")
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setOpen(true)
  }

  function handleBlur() {
    setTimeout(() => {
      setFocused(false)
      setOpen(false)
      setQuery("")
    }, 150)
  }

  function handleSelect(opt: SearchSelectOption) {
    onValueChange(opt.value)
    setOpen(false)
    setFocused(false)
    setQuery("")
  }

  const inputValue = focused ? query : (selected?.label ?? "")

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={inputValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onClick={handleClick}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="pr-8"
          data-placeholder={!selected && !focused ? "true" : undefined}
        />
        <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover text-popover-foreground shadow-md max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Brak wyników</div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(opt)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                  opt.value === value && "bg-accent/50"
                )}
              >
                <CheckIcon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    opt.value === value ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
