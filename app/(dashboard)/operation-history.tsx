'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { OperationLogEntry } from './reminder-actions'

const OPERATION_LABELS: Record<string, string> = {
  reminders_private: 'Prywatne',
  reminders_bmt: 'BMT',
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

export function OperationHistory({ entries }: { entries: OperationLogEntry[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Historia operacji</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Ukryj' : 'Pokaż'}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wpisów.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-4 text-left font-normal">Data</th>
                    <th className="py-2 pr-4 text-left font-normal">Operacja</th>
                    <th className="py-2 pr-4 text-left font-normal">Status</th>
                    <th className="py-2 text-left font-normal">Szczegóły</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDate(e.called_at)}</td>
                      <td className="py-2 pr-4">{OPERATION_LABELS[e.operation] ?? e.operation}</td>
                      <td className="py-2 pr-4">
                        {e.success ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">OK</Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-600">Błąd</Badge>
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {e.success ? (
                          `wysłano: ${e.sent ?? 0}, pominięto: ${e.skipped ?? 0}`
                        ) : e.failed ? (
                          <span>
                            wysłano: {e.sent ?? 0}, pominięto: {e.skipped ?? 0},{' '}
                            <span className="text-red-600">
                              błąd ({e.failed.length}): {e.failed.map((f) => f.email).join(', ')}
                            </span>
                          </span>
                        ) : (
                          e.error ?? 'nieznany błąd'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
