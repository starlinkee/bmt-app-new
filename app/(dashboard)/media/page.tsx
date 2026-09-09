'use client'

import { useState, useTransition, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  getSettlementGroups,
  createSettlementGroup,
  updateSettlementGroup,
  deleteSettlementGroup,
} from './actions'

import { getProperties } from '@/app/(dashboard)/nieruchomosci/actions'
import { getTenants } from '@/app/(dashboard)/najemcy/actions'
import { SearchSelect } from '@/components/ui/search-select'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { ConfirmEditDialog } from '@/components/ui/confirm-edit-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { Pencil, Trash2, Plus, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown, FileSpreadsheet } from 'lucide-react'

// W polach JSON klawisz Tab wstawia wcięcie (2 spacje) w miejscu kursora,
// zamiast przenosić fokus do następnego pola formularza.
function handleJsonTextareaTab(
  e: KeyboardEvent<HTMLTextAreaElement>,
  setValue: (v: string) => void
) {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const el = e.currentTarget
  const { selectionStart, selectionEnd, value } = el
  const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd)
  setValue(next)
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = selectionStart + 2
  })
}

type Group = Awaited<ReturnType<typeof getSettlementGroups>>[number]
type Property = Awaited<ReturnType<typeof getProperties>>[number]
type Tenant = Awaited<ReturnType<typeof getTenants>>[number]
type SortKey = 'id' | 'name' | 'properties' | 'spreadsheet_id' | 'tenants_count'
type SortDir = 'asc' | 'desc'

function getGroupProperties(g: Group): string {
  const props = g.settlement_group_properties as unknown as { properties: { name: string } }[]
  return props?.map((p) => p.properties?.name).filter(Boolean).join(', ') || ''
}

function getGroupTenantsCount(g: Group, allTenants: Tenant[]): number {
  const propIds = (g.settlement_group_properties as unknown as { property_id: number }[])
      ?.map((sgp) => sgp.property_id) ?? []
  return allTenants.filter((t) => propIds.includes(t.property_id)).length
}

function sortGroups(groups: Group[], key: SortKey, dir: SortDir, allTenants: Tenant[]): Group[] {
  return [...groups].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'id') {
      va = a.id
      vb = b.id
    } else if (key === 'name') {
      va = a.name.toLowerCase()
      vb = b.name.toLowerCase()
    } else if (key === 'properties') {
      va = getGroupProperties(a).toLowerCase()
      vb = getGroupProperties(b).toLowerCase()
    } else if (key === 'spreadsheet_id') {
      va = (a.spreadsheet_id ?? '').toLowerCase()
      vb = (b.spreadsheet_id ?? '').toLowerCase()
    } else if (key === 'tenants_count') {
      va = getGroupTenantsCount(a, allTenants)
      vb = getGroupTenantsCount(b, allTenants)
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesGroupFilter(g: Group, text: string): boolean {
  const q = text.toLowerCase()
  const name = g.name.toLowerCase()
  const props = getGroupProperties(g).toLowerCase()
  const sid = (g.spreadsheet_id ?? '').toLowerCase()
  return name.includes(q) || props.includes(q) || sid.includes(q)
}

const DEFAULT_EMAIL_SUBJECT = 'Rozliczenie mediów - {miesiac}/{rok}'
const DEFAULT_EMAIL_BODY = `Szanowny/a {imie},\nW załączeniu rozliczenie mediów za {miesiac}/{rok} na kwotę {kwota}.\n\nPozdrawiamy,\nBMT`

type TenantReadingEntry = { key: string; label: string }

function defaultReadingLabel(key: string): string {
  return key.replace(/_/g, ' ')
}

// Format tekstowy w polu: "klucz:Etykieta widoczna dla najemcy, klucz2:Etykieta 2"
// Etykieta jest opcjonalna — bez niej pokaże się klucz z podkreśleniami zamienionymi na spacje.
function parseTenantReadingKeysText(text: string): TenantReadingEntry[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':')
      if (idx === -1) return { key: part, label: defaultReadingLabel(part) }
      const key = part.slice(0, idx).trim()
      const label = part.slice(idx + 1).trim()
      return { key, label: label || defaultReadingLabel(key) }
    })
}

function formatTenantReadingKeysText(entries: TenantReadingEntry[]): string {
  return entries
    .map((e) => (e.label && e.label !== defaultReadingLabel(e.key) ? `${e.key}:${e.label}` : e.key))
    .join(', ')
}

// Klucze najemcy (tenant_reading_keys) muszą się dokładnie zgadzać z "save_key" pól
// source:"user" w mapowaniu wejściowym — inaczej odczyt najemcy nigdy się nie pojawi
// w panelu "Rozlicz Media" (getCurrentMeterReadings/getPreviousMeterReadings szukają
// po save_key/db_key, a nie po nazwie range). Zbieramy poprawne save_key, żeby
// wychwycić literówkę/pomyłkę (np. wpisanie nazwy range zamiast save_key) już przy zapisie grupy.
function extractValidSaveKeys(inputMapping: unknown): Set<string> {
  const keys = new Set<string>()
  if (!inputMapping || typeof inputMapping !== 'object') return keys
  for (const fields of Object.values(inputMapping as Record<string, unknown>)) {
    if (!fields || typeof fields !== 'object') continue
    for (const fieldDef of Object.values(fields as Record<string, unknown>)) {
      if (fieldDef && typeof fieldDef === 'object') {
        const sk = (fieldDef as { save_key?: unknown }).save_key
        const dk = (fieldDef as { db_key?: unknown }).db_key
        if (typeof sk === 'string' && sk) keys.add(sk)
        if (typeof dk === 'string' && dk) keys.add(dk)
      }
    }
  }
  return keys
}

function emptyForm() {
  return {
    name: '',
    spreadsheet_id: '',
    input_mapping_json: '{}',
    output_mapping_json: '[]',
    pdf_sheets_json: '[]',
    email_subject_template: 'Rozliczenie mediów {miesiac}/{rok}',
    email_body_template: DEFAULT_EMAIL_BODY,
    property_ids: [] as number[],
    tenant_reading_keys: {} as Record<string, string>,
  }
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey, sortKey: SortKey, sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
  return sortDir === 'asc'
    ? <ChevronUp className="ml-1 h-3 w-3 inline" />
    : <ChevronDown className="ml-1 h-3 w-3 inline" />
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterText, setFilterText] = useState('')
  const [initialForm, setInitialForm] = useState<typeof form | null>(null)


  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = filterText
    ? groups.filter((g) => matchesGroupFilter(g, filterText))
    : groups
  const sorted = sortGroups(filtered, sortKey, sortDir, tenants)

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
    
    let parsedTrk: Record<string, string> = {}
    if (raw.tenant_reading_keys && typeof raw.tenant_reading_keys === 'object' && !Array.isArray(raw.tenant_reading_keys)) {
      const trkMap = raw.tenant_reading_keys as Record<string, (string | TenantReadingEntry)[]>
      for (const [tId, entriesArr] of Object.entries(trkMap)) {
        if (!Array.isArray(entriesArr)) { parsedTrk[tId] = ''; continue }
        // Wspieramy stary format (same klucze jako string[]) obok nowego ({key,label}[]).
        const normalized: TenantReadingEntry[] = entriesArr.map((e) =>
          typeof e === 'string' ? { key: e, label: defaultReadingLabel(e) } : { key: e.key, label: e.label || defaultReadingLabel(e.key) }
        )
        parsedTrk[tId] = formatTenantReadingKeysText(normalized)
      }
    }

    const nextForm = {
      name: g.name,
      spreadsheet_id: g.spreadsheet_id,
      input_mapping_json: JSON.stringify(g.input_mapping_json, null, 2),
      output_mapping_json: JSON.stringify(g.output_mapping_json, null, 2),
      pdf_sheets_json: JSON.stringify(raw.pdf_sheets_json ?? [], null, 2),
      email_subject_template: (raw.email_subject_template as string) || 'Rozliczenie mediów {miesiac}/{rok}',
      email_body_template: (raw.email_body_template as string) || DEFAULT_EMAIL_BODY,
      property_ids: propIds,
      tenant_reading_keys: parsedTrk,
    }
    setForm(nextForm)
    setInitialForm(nextForm)
    setJsonError('')
    setOpen(true)
  }

  function handleSave() {
    let inputMap: unknown
    const jsonFields: { label: string; value: string }[] = [
      { label: 'Mapowanie wejściowe', value: form.input_mapping_json },
      { label: 'Mapowanie wyjściowe', value: form.output_mapping_json },
      { label: 'Arkusze PDF', value: form.pdf_sheets_json },
    ]
    for (const field of jsonFields) {
      try {
        JSON.parse(field.value)
      } catch (e) {
        const msg = `Nieprawidłowy JSON w polu "${field.label}": ${e instanceof Error ? e.message : String(e)}`
        setJsonError(msg)
        toast.error(msg)
        return
      }
    }
    inputMap = JSON.parse(form.input_mapping_json)
    setJsonError('')

    const validSaveKeys = extractValidSaveKeys(inputMap)
    const unknownKeys = new Set<string>()
    for (const text of Object.values(form.tenant_reading_keys)) {
      for (const entry of parseTenantReadingKeysText(text)) {
        if (!validSaveKeys.has(entry.key)) unknownKeys.add(entry.key)
      }
    }
    if (unknownKeys.size > 0) {
      toast.error(
        `Nieznane klucze w "Liczniki do podania przez najemcę": ${[...unknownKeys].join(', ')}. ` +
        `Klucz musi być identyczny z "save_key" pola w mapowaniu wejściowym (nie z nazwą range) — inaczej odczyt najemcy nigdy się nie pojawi w panelu Rozlicz Media.`
      )
      return
    }

    if (editing) {
      setConfirmOpen(true)
    } else {
      performSave()
    }
  }

  function performSave() {
    const inputMap = JSON.parse(form.input_mapping_json)
    const outputMap = JSON.parse(form.output_mapping_json)
    const pdfSheets = JSON.parse(form.pdf_sheets_json)

    startTransition(async () => {
      const finalTrk: Record<string, TenantReadingEntry[]> = {}
      for (const [tId, text] of Object.entries(form.tenant_reading_keys)) {
        const entries = parseTenantReadingKeysText(text)
        if (entries.length > 0) {
          finalTrk[tId] = entries
        }
      }

      const payload = {
        name: form.name,
        spreadsheet_id: form.spreadsheet_id,
        input_mapping_json: inputMap,
        output_mapping_json: outputMap as Record<string, string>,
        pdf_sheets_json: pdfSheets as Record<string, string>[],
        email_subject_template: form.email_subject_template,
        email_body_template: form.email_body_template,
        property_ids: form.property_ids,
        tenant_reading_keys: finalTrk,
      }
      if (editing) {
        await updateSettlementGroup(editing.id, payload)
        toast.success('Grupa zaktualizowana.')
      } else {
        await createSettlementGroup(payload)
        toast.success('Grupa dodana.')
      }
      setOpen(false)
      setConfirmOpen(false)
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
        <h1 className="text-2xl font-semibold">Media i grupy rozliczeniowe</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Dodaj
        </Button>
      </div>

      <TableFilterBar
        value={filterText}
        onChange={setFilterText}
        hideColumns={true}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 cursor-pointer select-none" onClick={() => handleSort('id' as any)}>
              ID<SortIcon col={'id' as any} sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
              Nazwa<SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('properties')}>
              Nieruchomości<SortIcon col="properties" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('spreadsheet_id')}>
              ID arkusza<SortIcon col="spreadsheet_id" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenants_count')}>
              Najemcy<SortIcon col="tenants_count" sortKey={sortKey} sortDir={sortDir} />
            </TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="text-muted-foreground">{g.id}</TableCell>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell>
                {getGroupProperties(g) || '—'}
              </TableCell>
              <TableCell className="font-mono text-xs truncate max-w-48">
                {g.spreadsheet_id || '—'}
              </TableCell>
              <TableCell className="text-center">
                {getGroupTenantsCount(g, tenants)}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {g.spreadsheet_id && (
                    <a href={`https://docs.google.com/spreadsheets/d/${g.spreadsheet_id}/edit`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'ghost', size: 'icon' })} title="Otwórz arkusz w nowej karcie">
                      <FileSpreadsheet className="h-4 w-4" />
                    </a>
                  )}
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
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
            <div className="space-y-3 p-3 border rounded-md bg-muted/20">
              <Label className="text-base">Liczniki do podania przez najemcę</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Zaznacz najemców, którzy będą sami podawać odczyty i wpisz dla nich odpowiednie klucze po przecinku (z mapowania wejściowego).
                Format: <code className="text-[11px]">klucz:Etykieta dla najemcy</code> — etykieta jest opcjonalna, bez niej najemca zobaczy techniczny klucz.
              </p>
              
              {(() => {
                const groupTenants = tenants.filter((t) => form.property_ids.includes(t.property_id))
                if (groupTenants.length === 0) {
                  return <p className="text-xs text-orange-600">Brak najemców. Wybierz nieruchomości powyżej.</p>
                }

                let validSaveKeys: Set<string>
                try {
                  validSaveKeys = extractValidSaveKeys(JSON.parse(form.input_mapping_json))
                } catch {
                  validSaveKeys = new Set()
                }

                return groupTenants.map((t) => {
                  const isChecked = form.tenant_reading_keys[t.id.toString()] !== undefined
                  const keysStr = form.tenant_reading_keys[t.id.toString()] || ''
                  const unknownKeys = validSaveKeys.size > 0
                    ? parseTenantReadingKeysText(keysStr).filter((e) => !validSaveKeys.has(e.key)).map((e) => e.key)
                    : []

                  return (
                    <div key={t.id} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const newTrk = { ...form.tenant_reading_keys }
                            if (e.target.checked) {
                              newTrk[t.id.toString()] = ''
                            } else {
                              delete newTrk[t.id.toString()]
                            }
                            setForm({ ...form, tenant_reading_keys: newTrk })
                          }}
                        />
                        {t.first_name} {t.last_name} 
                        <span className="text-muted-foreground font-normal">
                          ({(t.properties as { name?: string } | null)?.name || 'Brak nazwy lokalu'})
                        </span>
                      </label>
                      
                      {isChecked && (
                        <div className="pl-6 space-y-1">
                          <Input
                            value={keysStr}
                            onChange={(e) => {
                              setForm({
                                ...form,
                                tenant_reading_keys: {
                                  ...form.tenant_reading_keys,
                                  [t.id.toString()]: e.target.value
                                }
                              })
                            }}
                            placeholder="np. jp64_cieplaWodaLokal1:Ciepła woda, jp64_coLokal1:CO"
                            className={`h-8 text-sm ${unknownKeys.length > 0 ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                          />
                          {unknownKeys.length > 0 && (
                            <p className="text-xs text-destructive">
                              Nieznany klucz: {unknownKeys.join(', ')} — nie występuje jako &quot;save_key&quot; w mapowaniu wejściowym poniżej, więc odczyt najemcy nigdy się nie pojawi w panelu Rozlicz Media.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
            <div className="space-y-1">
              <Label>Mapowanie wejściowe (JSON)</Label>
              <Textarea
                value={form.input_mapping_json}
                onChange={(e) => setForm({ ...form, input_mapping_json: e.target.value })}
                onKeyDown={(e) => handleJsonTextareaTab(e, (v) => setForm({ ...form, input_mapping_json: v }))}
                rows={12}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>Mapowanie wyjściowe (JSON)</Label>
              <Textarea
                value={form.output_mapping_json}
                onChange={(e) => setForm({ ...form, output_mapping_json: e.target.value })}
                onKeyDown={(e) => handleJsonTextareaTab(e, (v) => setForm({ ...form, output_mapping_json: v }))}
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
                  description: `ID: ${t.id}${(t.properties as { name?: string } | null)?.name ? ` · ${(t.properties as { name: string }).name}` : ''}`,
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
                    <span className="font-mono text-xs font-semibold bg-background border px-2 py-0.5 rounded select-all">
                      ID: {t.id}
                    </span>
                    <span className="text-muted-foreground">
                      {t.first_name} {t.last_name}
                      {(t.properties as { name?: string } | null)?.name && (
                        <> · {(t.properties as { name: string }).name}</>
                      )}
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
                onKeyDown={(e) => handleJsonTextareaTab(e, (v) => setForm({ ...form, pdf_sheets_json: v }))}
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
              <p className="text-xs text-muted-foreground">Zmienne: {'{imie}'}, {'{kwota}'}, {'{miesiac}'}, {'{rok}'}</p>
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

      <ConfirmEditDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={performSave}
        pending={pending}
        originalData={editing ? initialForm : null}
        newData={form}
        labels={{
          name: 'Nazwa',
          spreadsheet_id: 'ID arkusza Google',
          input_mapping_json: 'Mapowanie wejściowe (JSON)',
          output_mapping_json: 'Mapowanie wyjściowe (JSON)',
          pdf_sheets_json: 'Arkusze PDF (JSON)',
          email_subject_template: 'Temat e-maila',
          email_body_template: 'Treść e-maila',
          property_ids: 'Nieruchomości',
          tenant_reading_keys: 'Klucze odczytu najemców',
        }}
      />
    </div>
  )
}
