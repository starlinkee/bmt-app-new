'use client'

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from 'next/link'
import { getTenants, createTenant, updateTenant, deleteTenant } from './actions'
import { getProperties } from '@/app/(dashboard)/properties/actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchSelect } from '@/components/ui/search-select'
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
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2, Plus, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { TableFilterBar } from '@/components/ui/table-filter-bar'

type Tenant = Awaited<ReturnType<typeof getTenants>>[number]
type Property = Awaited<ReturnType<typeof getProperties>>[number]
type SortKey = 'name' | 'property' | 'type' | 'email' | 'phone' | 'contracts'
type SortDir = 'asc' | 'desc'

const FILTER_COLUMNS = [
  { key: 'name', label: 'Imię i nazwisko' },
  { key: 'property', label: 'Nieruchomość' },
  { key: 'type', label: 'Typ' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefon' },
]

function matchesTenantFilter(t: Tenant, text: string, col: string): boolean {
  const q = text.toLowerCase()
  const name = `${t.first_name} ${t.last_name}`.toLowerCase()
  const property = ((t.properties as unknown as { name: string } | null)?.name ?? '').toLowerCase()
  const type = t.tenant_type.toLowerCase()
  const email = (t.email ?? '').toLowerCase()
  const phone = (t.phone ?? '').toLowerCase()
  if (col === '__all__') return name.includes(q) || property.includes(q) || type.includes(q) || email.includes(q) || phone.includes(q)
  if (col === 'name') return name.includes(q)
  if (col === 'property') return property.includes(q)
  if (col === 'type') return type.includes(q)
  if (col === 'email') return email.includes(q)
  if (col === 'phone') return phone.includes(q)
  return false
}

function sortTenants(tenants: Tenant[], key: SortKey, dir: SortDir): Tenant[] {
  return [...tenants].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'name') {
      va = `${a.last_name} ${a.first_name}`.toLowerCase()
      vb = `${b.last_name} ${b.first_name}`.toLowerCase()
    } else if (key === 'property') {
      va = ((a.properties as unknown as { name: string } | null)?.name ?? '').toLowerCase()
      vb = ((b.properties as unknown as { name: string } | null)?.name ?? '').toLowerCase()
    } else if (key === 'type') {
      va = a.tenant_type.toLowerCase()
      vb = b.tenant_type.toLowerCase()
    } else if (key === 'email') {
      va = (a.email ?? '').toLowerCase()
      vb = (b.email ?? '').toLowerCase()
    } else if (key === 'phone') {
      va = (a.phone ?? '').toLowerCase()
      vb = (b.phone ?? '').toLowerCase()
    } else if (key === 'contracts') {
      va = (a.contracts as unknown as { count: number }[])?.[0]?.count ?? 0
      vb = (b.contracts as unknown as { count: number }[])?.[0]?.count ?? 0
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function emptyForm() {
  return {
    tenant_type: 'PRIVATE',
    first_name: '',
    last_name: '',
    company_name: '',
    email: '',
    email2: '',
    phone: '',
    bank_accounts_as_text: '',
    nip: '',
    address1: '',
    address2: '',
    property_id: '',
  }
}

export default function TenantsPage() {
  const queryClient = useQueryClient()
  const { data: tenants = [] } = useQuery({
    queryKey: QUERY_KEYS.tenants,
    queryFn: getTenants,
  })
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: QUERY_KEYS.properties,
    queryFn: getProperties,
  })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
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

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />
  }

  const filteredTenants = filterText
    ? tenants.filter((t) => matchesTenantFilter(t, filterText, filterCol))
    : tenants
  const sortedTenants = sortTenants(filteredTenants, sortKey, sortDir)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(t: Tenant) {
    setEditing(t)
    setForm({
      tenant_type: t.tenant_type,
      first_name: t.first_name,
      last_name: t.last_name,
      company_name: (t as unknown as { company_name?: string | null }).company_name ?? '',
      email: t.email ?? '',
      email2: (t as unknown as { email2?: string | null }).email2 ?? '',
      phone: t.phone ?? '',
      bank_accounts_as_text: t.bank_accounts_as_text,
      nip: t.nip ?? '',
      address1: t.address1 ?? '',
      address2: t.address2 ?? '',
      property_id: String(t.property_id),
    })
    setOpen(true)
  }

  function handleSave() {
    if (!form.first_name || !form.last_name || !form.property_id) {
      toast.error('Imię, nazwisko i nieruchomość są wymagane.')
      return
    }
    if (form.tenant_type === 'BUSINESS' && !form.nip) {
      toast.error('NIP jest wymagany dla firmy.')
      return
    }

    const payload = {
      tenant_type: form.tenant_type,
      first_name: form.first_name,
      last_name: form.last_name,
      company_name: form.company_name || undefined,
      email: form.email || undefined,
      email2: form.email2 || undefined,
      phone: form.phone || undefined,
      bank_accounts_as_text: form.bank_accounts_as_text,
      nip: form.nip || undefined,
      address1: form.address1 || undefined,
      address2: form.address2 || undefined,
      property_id: Number(form.property_id),
    }

    startTransition(async () => {
      if (editing) {
        await updateTenant(editing.id, payload)
        toast.success('Najemca zaktualizowany.')
      } else {
        await createTenant(payload)
        toast.success('Najemca dodany.')
      }
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tenants })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.contracts })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.properties })
    })
  }

  function handleDelete(t: Tenant) {
    if (!confirm(`Usunąć "${t.first_name} ${t.last_name}"?`)) return
    startTransition(async () => {
      const result = await deleteTenant(t.id)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Najemca usunięty.')
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tenants })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.contracts })
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.properties })
      }
    })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Najemcy</h1>
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
              Imię i nazwisko<SortIcon col="name" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('property')}>
              Nieruchomość<SortIcon col="property" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')}>
              Typ<SortIcon col="type" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('email')}>
              E-mail<SortIcon col="email" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('phone')}>
              Telefon<SortIcon col="phone" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('contracts')}>
              Umowy<SortIcon col="contracts" />
            </TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTenants.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">
                <div>{t.first_name} {t.last_name}</div>
                {(t as unknown as { company_name?: string | null }).company_name && (
                  <div className="text-xs text-muted-foreground">
                    {(t as unknown as { company_name: string }).company_name}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {(t.properties as unknown as { name: string } | null)?.name}
              </TableCell>
              <TableCell>
                <Badge variant={t.tenant_type === 'BUSINESS' ? 'default' : 'secondary'}>
                  {t.tenant_type}
                </Badge>
              </TableCell>
              <TableCell>
                {t.email}
                {(t as unknown as { email2?: string | null }).email2 && (
                  <span className="text-muted-foreground">, {(t as unknown as { email2: string }).email2}</span>
                )}
              </TableCell>
              <TableCell>{t.phone}</TableCell>
              <TableCell>
                {(t.contracts as unknown as { count: number }[])?.[0]?.count ?? 0}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Link
                    href={`/tenants/${t.id}`}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(t)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {sortedTenants.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : 'Brak najemców'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edytuj najemcę' : 'Nowy najemca'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Imię *</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Nazwisko *</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nieruchomość *</Label>
              <SearchSelect
                options={properties.map((p) => ({
                  value: String(p.id),
                  label: p.name || p.address1 || String(p.id),
                  description: p.name ? p.address1 ?? undefined : undefined,
                }))}
                value={form.property_id}
                onValueChange={(v) => setForm({ ...form, property_id: v })}
                placeholder="Wybierz nieruchomość..."
              />
            </div>
            <div className="space-y-1">
              <Label>Typ</Label>
              <Select
                value={form.tenant_type}
                onValueChange={(v) => setForm({ ...form, tenant_type: v ?? 'PRIVATE' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">PRIVATE</SelectItem>
                  <SelectItem value="BUSINESS">BUSINESS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tenant_type === 'BUSINESS' && (
              <>
                <div className="space-y-1">
                  <Label>Nazwa firmy</Label>
                  <Input
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    placeholder="Używana na rachunkach zamiast imienia i nazwiska"
                  />
                </div>
                <div className="space-y-1">
                  <Label>NIP *</Label>
                  <Input
                    value={form.nip}
                    onChange={(e) => setForm({ ...form, nip: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Adres 1</Label>
                  <Input
                    value={form.address1}
                    onChange={(e) => setForm({ ...form, address1: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Adres 2</Label>
                  <Input
                    value={form.address2}
                    onChange={(e) => setForm({ ...form, address2: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>E-mail 2</Label>
              <Input
                type="email"
                value={form.email2}
                onChange={(e) => setForm({ ...form, email2: e.target.value })}
                placeholder="Opcjonalny drugi adres e-mail"
              />
            </div>
            <div className="space-y-1">
              <Label>Telefon</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Numery kont (jeden na linię)</Label>
              <Textarea
                value={form.bank_accounts_as_text}
                onChange={(e) =>
                  setForm({ ...form, bank_accounts_as_text: e.target.value })
                }
                rows={3}
              />
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
