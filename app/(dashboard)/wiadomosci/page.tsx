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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function WiadomosciPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [recipient, setRecipient] = useState('')

  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: '',
    dateTo: '',
    recipient: '',
  })

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['emailLogs', appliedFilters],
    queryFn: () => getEmailLogs(appliedFilters),
  })

  const [selectedLog, setSelectedLog] = useState<Awaited<ReturnType<typeof getEmailLogs>>[number] | null>(null)

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault()
    setAppliedFilters({ dateFrom, dateTo, recipient })
  }

  const handleClear = () => {
    setDateFrom('')
    setDateTo('')
    setRecipient('')
    setAppliedFilters({ dateFrom: '', dateTo: '', recipient: '' })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dziennik Wiadomości</h1>
      </div>

      <form onSubmit={handleFilter} className="flex flex-col sm:flex-row gap-4 items-end bg-card p-4 border rounded-md shadow-sm">
        <div className="space-y-1.5 flex-1 w-full">
          <Label htmlFor="dateFrom">Data od</Label>
          <Input 
            id="dateFrom" 
            type="date" 
            value={dateFrom} 
            onChange={(e) => setDateFrom(e.target.value)} 
          />
        </div>
        <div className="space-y-1.5 flex-1 w-full">
          <Label htmlFor="dateTo">Data do</Label>
          <Input 
            id="dateTo" 
            type="date" 
            value={dateTo} 
            onChange={(e) => setDateTo(e.target.value)} 
          />
        </div>
        <div className="space-y-1.5 flex-1 w-full">
          <Label htmlFor="recipient">Odbiorca</Label>
          <Input 
            id="recipient" 
            type="text" 
            placeholder="Szukaj po adresie..." 
            value={recipient} 
            onChange={(e) => setRecipient(e.target.value)} 
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button type="button" variant="outline" onClick={handleClear}>Wyczyść</Button>
          <Button type="submit">Szukaj</Button>
        </div>
      </form>

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
            {selectedLog?.attachments && Array.isArray(selectedLog.attachments) && selectedLog.attachments.length > 0 && (
              <div className="text-muted-foreground flex items-center gap-2">
                Załączniki: 
                <div className="flex flex-wrap gap-2">
                  {(selectedLog.attachments as { path: string; name: string }[]).map((att: { path: string; name: string }, i: number) => (
                    <a
                      key={i}
                      href={`/api/attachments/${att.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-paperclip"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      {att.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
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
