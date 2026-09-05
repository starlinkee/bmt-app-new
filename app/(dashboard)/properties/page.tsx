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
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { Pencil, Trash2, Plus, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type Property = Awaited<ReturnType<typeof getProperties>>[number]
type SortKey = 'name' | 'address' | 'type' | 'tenants'
type SortDir = 'asc' | 'desc'

const PROPERTY_TYPES = ['Mieszkanie', 'Lokal użytkowy']

const FILTER_COLUMNS = [
  { key: 'name', label: 'Nazwa' },
  { key: 'address', label: 'Adres' },
  { key: 'type', label: 'Typ' },
]

function emptyForm() {
  return { name: '', address1: '', address2: '', type: '' }
}

function sortProperties(props: Property[], key: SortKey, dir: SortDir): Property[] {
  return [...props].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'name') {
      va = a.name?.toLowerCase() ?? ''
      vb = b.name?.toLowerCase() ?? ''
    } else if (key === 'address') {
      va = a.address1?.toLowerCase() ?? ''
      vb = b.address1?.toLowerCase() ?? ''
    } else if (key === 'type') {
      va = a.type?.toLowerCase() ?? ''
      vb = b.type?.toLowerCase() ?? ''
    } else if (key === 'tenants') {
      va = (a.tenants as unknown as { count: number }[])?.[0]?.count ?? 0
      vb = (b.tenants as unknown as { count: number }[])?.[0]?.count ?? 0
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesFilter(p: Property, text: string, col: string): boolean {
  const q = text.toLowerCase()
  const address = [p.address1, p.address2].filter(Boolean).join(', ').toLowerCase()
  const tenantCount = String((p.tenants as unknown as { count: number }[])?.[0]?.count ?? 0)
  if (col === '__all__') {
    return (
      (p.name?.toLowerCase() ?? '').includes(q) ||
      address.includes(q) ||
      (p.type?.toLowerCase() ?? '').includes(q) ||
      tenantCount.includes(q)
    )
  }
  if (col === 'name') return (p.name?.toLowerCase() ?? '').includes(q)
  if (col === 'address') return address.includes(q)
  if (col === 'type') return (p.type?.toLowerCase() ?? '').includes(q)
  return false
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey, sortKey: SortKey, sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
  return sortDir === 'asc'
    ? <ChevronUp className="ml-1 h-3 w-3 inline" />
    : <ChevronDown className="ml-1 h-3 w-3 inline" />
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
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterText, setFilterText] = useState('')
  const [filterCol, setFilterCol] = useState('__all__')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = filterText
    ? properties.filter((p) => matchesFilter(p, filterText, filterCol))
    : properties
  const sorted = sortProperties(filtered, sortKey, sortDir)

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

      <TableFilterBar
        value={filterText}
        onChange={setFilterText}
        column={filterCol}
        onColumnChange={setFilterCol}
        columns={FILTER_COLUMNS}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
              Nazwa<SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('address')}>
              Adres<SortIcon col="address" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')}>
              Typ<SortIcon col="type" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenants')}>
              Najemcy<SortIcon col="tenants" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => (
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
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : 'Brak nieruchomości'}
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
