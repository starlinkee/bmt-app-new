import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ConfirmEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  originalData: Record<string, any> | null
  newData: Record<string, any>
  title?: string
  pending?: boolean
  labels?: Record<string, string>
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'boolean') return val ? 'Tak' : 'Nie'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

export function ConfirmEditDialog({
  open,
  onOpenChange,
  onConfirm,
  originalData,
  newData,
  title = 'Potwierdź zmiany',
  pending = false,
  labels = {},
}: ConfirmEditDialogProps) {
  const diffs: { key: string; label: string; old: string; new: string }[] = []

  if (originalData && newData) {
    for (const key of Object.keys(newData)) {
      const origVal = formatValue(originalData[key])
      const newVal = formatValue(newData[key])

      if (origVal !== newVal) {
        diffs.push({ key, label: labels[key] || key, old: origVal, new: newVal })
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        {diffs.length > 0 ? (
          <div className="my-4">
            <p className="text-sm text-muted-foreground mb-2">
              Czy na pewno chcesz zapisać te zmiany? Różnice:
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pole</TableHead>
                  <TableHead>Co było</TableHead>
                  <TableHead>Co będzie teraz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffs.map((d) => (
                  <TableRow key={d.key}>
                    <TableCell className="font-medium">{d.label}</TableCell>
                    <TableCell className="text-red-600 dark:text-red-400 line-through break-all">
                      {d.old}
                    </TableCell>
                    <TableCell className="text-green-600 dark:text-green-400 break-all">
                      {d.new}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="my-4 py-8 text-center text-muted-foreground">
            Brak widocznych zmian.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Anuluj
          </Button>
          <Button onClick={onConfirm} disabled={pending || diffs.length === 0}>
            Zapisz zmiany
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
