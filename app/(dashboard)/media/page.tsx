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
import { getTenants } from '@/app/(dashboard)/tenants/actions'
import { SearchSelect } from '@/components/ui/search-select'
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
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { Pencil, Trash2, Plus, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type Group = Awaited<ReturnType<typeof getSettlementGroups>>[number]
type Property = Awaited<ReturnType<typeof getProperties>>[number]
type Tenant = Awaited<ReturnType<typeof getTenants>>[number]
type SortKey = 'name' | 'properties' | 'spreadsheet_id'
type SortDir = 'asc' | 'desc'

const FILTER_COLUMNS = [
  { key: 'name', label: 'Nazwa' },
  { key: 'properties', label: 'Nieruchomości' },
  { key: 'spreadsheet_id', label: 'ID arkusza' },
]

function getGroupProperties(g: Group): string {
  const props = g.settlement_group_properties as unknown as { properties: { name: string } }[]
  return props?.map((p) => p.properties?.name).filter(Boolean).join(', ') || ''
}

function sortGroups(groups: Group[], key: SortKey, dir: SortDir): Group[] {
  return [...groups].sort((a, b) => {
    let va = ''
    let vb = ''
    if (key === 'name') {
      va = a.name.toLowerCase()
      vb = b.name.toLowerCase()
    } else if (key === 'properties') {
      va = getGroupProperties(a).toLowerCase()
      vb = getGroupProperties(b).toLowerCase()
    } else if (key === 'spreadsheet_id') {
      va = (a.spreadsheet_id ?? '').toLowerCase()
      vb = (b.spreadsheet_id ?? '').toLowerCase()
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesGroupFilter(g: Group, text: string, col: string): boolean {
  const q = text.toLowerCase()
  const name = g.name.toLowerCase()
  const props = getGroupProperties(g).toLowerCase()
  const sid = (g.spreadsheet_id ?? '').toLowerCase()
  if (col === '__all__') return name.includes(q) || props.includes(q) || sid.includes(q)
  if (col === 'name') return name.includes(q)
  if (col === 'properties') return props.includes(q)
  if (col === 'spreadsheet_id') return sid.includes(q)
  return false
}

function emptyForm() {
  return {
    name: '',
    spreadsheet_id: '',
    input_mapping_json: '{}',
    output_mapping_json: '[]',
    pdf_sheets_json: '[]',
    email_subject_template: '',
    email_body_template: '',
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
  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: QUERY_KEYS.tenants,
    queryFn: getTenants,
  })
  const [tenantSearch, setTenantSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [jsonError, setJsonError] = useState('')
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

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />
  }

  const filtered = filterText
    ? groups.filter((g) => matchesGroupFilter(g, filterText, filterCol))
    : groups
  const sorted = sortGroups(filtered, sortKey, sortDir)

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
    const raw = g as Record<string, unknown>
    setForm({
      name: g.name,
      spreadsheet_id: g.spreadsheet_id,
      input_mapping_json: JSON.stringify(g.input_mapping_json, null, 2),
      output_mapping_json: JSON.stringify(g.output_mapping_json, null, 2),
      pdf_sheets_json: JSON.stringify(raw.pdf_sheets_json ?? [], null, 2),
      email_subject_template: (raw.email_subject_template as string) ?? '',
      email_body_template: (raw.email_body_template as string) ?? '',
      property_ids: propIds,
    })
    setJsonError('')
    setOpen(true)
  }

  function handleSave() {
    let inputMap: Record<string, string>
    let outputMap: unknown
    let pdfSheets: unknown
    try {
      inputMap = JSON.parse(form.input_mapping_json)
      outputMap = JSON.parse(form.output_mapping_json)
      pdfSheets = JSON.parse(form.pdf_sheets_json)
    } catch {
      setJsonError('Nieprawidłowy JSON.')
      return
    }
    setJsonError('')

    startTransition(async () => {
      const payload = {
        name: form.name,
        spreadsheet_id: form.spreadsheet_id,
        input_mapping_json: inputMap,
        output_mapping_json: outputMap as Record<string, string>,
        pdf_sheets_json: pdfSheets as Record<string, string>[],
        email_subject_template: form.email_subject_template || undefined,
        email_body_template: form.email_body_template || undefined,
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
              Nazwa<SortIcon col="name" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('properties')}>
              Nieruchomości<SortIcon col="properties" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('spreadsheet_id')}>
              ID arkusza<SortIcon col="spreadsheet_id" />
            </TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell>
                {getGroupProperties(g) || '—'}
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
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : 'Brak grup'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj grupę' : 'Nowa grupa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
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
                rows={12}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>Mapowanie wyjściowe (JSON)</Label>
              <Textarea
                value={form.output_mapping_json}
                onChange={(e) => setForm({ ...form, output_mapping_json: e.target.value })}
                rows={8}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1 rounded-md border p-3 bg-muted/40">
              <Label className="text-xs text-muted-foreground">Szukaj najemcy — ID</Label>
              <SearchSelect
                options={tenants.map((t) => ({
                  value: String(t.id),
                  label: `${t.first_name} ${t.last_name}`,
                  description: (t.properties as { name?: string } | null)?.name,
                }))}
                value={tenantSearch}
                onValueChange={setTenantSearch}
                placeholder="Wyszukaj najemcę..."
              />
              {tenantSearch && (() => {
                const t = tenants.find((t) => String(t.id) === tenantSearch)
                if (!t) return null
                return (
                  <div className="flex items-center justify-between pt-1 text-sm">
                    <span className="text-muted-foreground">
                      {t.first_name} {t.last_name}
                      {(t.properties as { name?: string } | null)?.name && (
                        <> · {(t.properties as { name: string }).name}</>
                      )}
                    </span>
                    <span className="font-mono text-xs font-semibold bg-background border px-2 py-0.5 rounded select-all">
                      ID: {t.id}
                    </span>
                  </div>
                )
              })()}
            </div>
            <div className="space-y-1">
              <Label>Arkusze PDF (JSON)</Label>
              <Textarea
                value={form.pdf_sheets_json}
                onChange={(e) => setForm({ ...form, pdf_sheets_json: e.target.value })}
                rows={5}
                className="font-mono text-xs"
                placeholder={'[\n  { "tab": "Zakładka", "name": "etykieta", "range": "A1:H30", "portrait": true }\n]'}
              />
            </div>
            <div className="space-y-1">
              <Label>Temat e-maila</Label>
              <Input
                value={form.email_subject_template}
                onChange={(e) => setForm({ ...form, email_subject_template: e.target.value })}
                placeholder="Rozliczenie mediów {miesiac}/{rok}"
              />
              <p className="text-xs text-muted-foreground">Zmienne: {'{imie}'}, {'{numer_rachunku}'}, {'{kwota}'}, {'{miesiac}'}, {'{rok}'}</p>
            </div>
            <div className="space-y-1">
              <Label>Treść e-maila</Label>
              <Textarea
                value={form.email_body_template}
                onChange={(e) => setForm({ ...form, email_body_template: e.target.value })}
                rows={6}
                placeholder={'Szanowny/a {imie},\nW załączeniu rozliczenie mediów za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy,\nBMT'}
              />
              <p className="text-xs text-muted-foreground">Każda linia tekstu = osobny akapit w mailu. Puste = domyślna treść.</p>
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
