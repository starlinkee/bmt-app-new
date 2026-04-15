'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

type TaskItem = {
  label: string
  status: 'TODO' | 'DONE'
  href: string
}

export function TaskList({ items }: { items: TaskItem[] }) {
  const [showDone, setShowDone] = useState(false)

  const visible = showDone
    ? items.filter((i) => i.status === 'DONE')
    : items.filter((i) => i.status !== 'DONE')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Label htmlFor="show-done" className="text-sm cursor-pointer">
          Pokaż ukończone
        </Label>
        <Switch
          id="show-done"
          checked={showDone}
          onCheckedChange={setShowDone}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {showDone ? 'Brak ukończonych zadań.' : 'Brak zadań do zrobienia.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item, i) => (
            <li key={i} className="flex items-center gap-3">
              {item.status === 'DONE' ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <Link href={item.href} className="text-sm hover:underline">
                {item.label}
              </Link>
              <Badge
                variant={item.status === 'DONE' ? 'default' : 'secondary'}
                className="ml-auto text-xs"
              >
                {item.status === 'DONE' ? 'Zrobione' : 'Do zrobienia'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
