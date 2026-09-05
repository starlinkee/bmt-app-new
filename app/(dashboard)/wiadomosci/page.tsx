'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getEmailLogs } from './actions'
import { formatDate } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function WiadomosciPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['emailLogs'],
    queryFn: getEmailLogs,
  })

  const [selectedLog, setSelectedLog] = useState<any>(null)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dziennik Wiadomości</h1>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Odbiorca</TableHead>
              <TableHead>Temat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  Ładowanie…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  Brak wysłanych wiadomości.
                </TableCell>
              </TableRow>
            )}
            {logs.map((log) => (
              <TableRow
                key={log.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedLog(log)}
              >
                <TableCell className="whitespace-nowrap">
                  {formatDate(log.sent_at)}
                </TableCell>
                <TableCell>{log.to_email}</TableCell>
                <TableCell className="font-medium">{log.subject}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedLog?.subject}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="text-muted-foreground">
              Do: <span className="font-medium text-foreground">{selectedLog?.to_email}</span>
            </div>
            <div className="text-muted-foreground">
              Data: <span className="font-medium text-foreground">{selectedLog && formatDate(selectedLog.sent_at)}</span>
            </div>
            <hr />
            <div
              className="mt-4 bg-muted/30 p-4 rounded-md"
              dangerouslySetInnerHTML={{ __html: selectedLog?.body || '' }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
