'use client'

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getProperties,
  createProperty,
  updateProperty,
  deleteProperty,
} from './actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Pencil, Trash2, Plus } from 'lucide-react'

type Property = Awaited<ReturnType<typeof getProperties>>[number]

const PROPERTY_TYPES = ['Mieszkanie', 'Lokal użytkowy']

function emptyForm() {
  return { name: '', address1: '', address2: '', type: '' }
}

export default function PropertiesPage() {
  const queryClient = useQueryClient()
  const { data: properties = [] } = useQuery({
    queryKey: QUERY_KEYS.properties,
    queryFn: getProperties,
  })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Property | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [pending, startTransition] = useTransition()

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(p: Property) {
    setEditing(p)
    setForm({
      name: p.name,
      address1: p.address1,
      address2: p.address2 ?? '',
      type: p.type,
    })
    setOpen(true)
  }

  function handleSave() {
    if (!form.address1 || !form.type) {
      toast.error('Adres i typ są wymagane.')
      return
    }
    startTransition(async () => {
      if (editing) {
        await updateProperty(editing.id, form)
        toast.success('Nieruchomość zaktualizowana.')
      } else {
        await createProperty(form)
        toast.success('Nieruchomość dodana.')
      }
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.properties })
    })
  }

  function handleDelete(p: Property) {
    if (!confirm(`Usunąć "${p.name}"?`)) return
    startTransition(async () => {
      const result = await deleteProperty(p.id)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Nieruchomość usunięta.')
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.properties })
      }
    })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nieruchomości</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Dodaj
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nazwa</TableHead>
            <TableHead>Adres</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Najemcy</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {properties.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                {p.address1}
                {p.address2 && `, ${p.address2}`}
              </TableCell>
              <TableCell>{p.type}</TableCell>
              <TableCell>
                {(p.tenants as unknown as { count: number }[])?.[0]?.count ?? 0}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {properties.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Brak nieruchomości
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edytuj nieruchomość' : 'Nowa nieruchomość'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nazwa</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Adres *</Label>
              <Input
                value={form.address1}
                onChange={(e) =>
                  setForm({ ...form, address1: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Adres 2</Label>
              <Input
                value={form.address2}
                onChange={(e) =>
                  setForm({ ...form, address2: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Typ *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v ?? '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz typ" />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
