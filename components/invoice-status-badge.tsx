import { Badge } from '@/components/ui/badge'

export function InvoiceStatusBadge({ isPaid }: { isPaid: boolean }) {
  return isPaid ? (
    <Badge variant="default" className="bg-green-600 hover:bg-green-600">
      Opłacone
    </Badge>
  ) : (
    <Badge variant="destructive">Zaległe</Badge>
  )
}
