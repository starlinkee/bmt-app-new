'use client'

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  getSettlementGroups,
  createSettlementGroup,
  updateSettlementGroup,
  deleteSettlementGroup,
} from './actions'
import { getProperties } from '@/app/(dashboard)/properties/actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pencil, Trash2, Plus, ExternalLink } from 'lucide-react'

type Group = Awaited<ReturnType<typeof getSettlementGroups>>[number]
type Property = Awaited<ReturnType<typeof getProperties>>[number]

function emptyForm() {
  return {
    name: '',
    spreadsheet_id: '',
    input_mapping_json: '{}',
    output_mapping_json: '{}',
    property_ids: [] as number[],
  }
}

export default function MediaPage() {
  const queryClient = useQueryClient()
  const { data: groups = [] } = useQuery({
    queryKey: QUERY_KEYS.settlementGroups,
    queryFn: getSettlementGroups,
  })
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: QUERY_KEYS.properties,
    queryFn: getProperties,
  })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [jsonError, setJsonError] = useState('')
  const [pending, startTransition] = useTransition()

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setJsonError('')
    setOpen(true)
  }

  function openEdit(g: Group) {
    setEditing(g)
    const propIds = (g.settlement_group_properties as unknown as { property_id: number }[])
      ?.map((sgp) => sgp.property_id) ?? []
    setForm({
      name: g.name,
      spreadsheet_id: g.spreadsheet_id,
      input_mapping_json: JSON.stringify(g.input_mapping_json, null, 2),
      output_mapping_json: JSON.stringify(g.output_mapping_json, null, 2),
      property_ids: propIds,
    })
    setJsonError('')
    setOpen(true)
  }

  function handleSave() {
    let inputMap: Record<string, string>
    let outputMap: Record<string, string>
    try {
      inputMap = JSON.parse(form.input_mapping_json)
      outputMap = JSON.parse(form.output_mapping_json)
    } catch {
      setJsonError('Nieprawidłowy JSON w mapowaniu.')
      return
    }
    setJsonError('')

    startTransition(async () => {
      const payload = {
        name: form.name,
        spreadsheet_id: form.spreadsheet_id,
        input_mapping_json: inputMap,
        output_mapping_json: outputMap,
        property_ids: form.property_ids,
      }
      if (editing) {
        await updateSettlementGroup(editing.id, payload)
        toast.success('Grupa zaktualizowana.')
      } else {
        await createSettlementGroup(payload)
        toast.success('Grupa dodana.')
      }
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settlementGroups })
    })
  }

  function handleDelete(g: Group) {
    if (!confirm(`Usunąć grupę "${g.name}"?`)) return
    startTransition(async () => {
      await deleteSettlementGroup(g.id)
      toast.success('Grupa usunięta.')
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settlementGroups })
    })
  }

  function toggleProperty(id: number) {
    setForm((f) => ({
      ...f,
      property_ids: f.property_ids.includes(id)
        ? f.property_ids.filter((p) => p !== id)
        : [...f.property_ids, id],
    }))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Media — grupy rozliczeń</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Dodaj
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nazwa</TableHead>
            <TableHead>Nieruchomości</TableHead>
            <TableHead>ID arkusza</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => {
            const props = (g.settlement_group_properties as unknown as {
              properties: { name: string }
            }[])
            return (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell>
                  {props?.map((p) => p.properties?.name).filter(Boolean).join(', ') || '—'}
                </TableCell>
                <TableCell className="font-mono text-xs truncate max-w-48">
                  {g.spreadsheet_id || '—'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Link
                      href={`/media/${g.id}`}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(g)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {groups.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                Brak grup
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj grupę' : 'Nowa grupa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>Nazwa</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>ID arkusza Google</Label>
              <Input
                value={form.spreadsheet_id}
                onChange={(e) => setForm({ ...form, spreadsheet_id: e.target.value })}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              />
            </div>
            <div className="space-y-1">
              <Label>Nieruchomości</Label>
              <div className="space-y-1.5">
                {properties.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.property_ids.includes(p.id)}
                      onChange={() => toggleProperty(p.id)}
                    />
                    {p.name || p.address1}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Mapowanie wejściowe (JSON)</Label>
              <Textarea
                value={form.input_mapping_json}
                onChange={(e) => setForm({ ...form, input_mapping_json: e.target.value })}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>Mapowanie wyjściowe (JSON)</Label>
              <Textarea
                value={form.output_mapping_json}
                onChange={(e) => setForm({ ...form, output_mapping_json: e.target.value })}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={pending}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
