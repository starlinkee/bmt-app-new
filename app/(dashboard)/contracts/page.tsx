'use client'

import { useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getContracts, createContract, updateContract, deleteContract } from './actions'
import { getTenants } from '@/app/(dashboard)/tenants/actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { TableFilterBar } from '@/components/ui/table-filter-bar'
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2, Plus, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { formatAmount, formatDate } from '@/lib/utils'

type Contract = Awaited<ReturnType<typeof getContracts>>[number]
type Tenant = Awaited<ReturnType<typeof getTenants>>[number]
type SortKey = 'tenant' | 'property' | 'type' | 'amount' | 'number' | 'from' | 'to' | 'active'
type SortDir = 'asc' | 'desc'

const FILTER_COLUMNS = [
  { key: 'tenant', label: 'Najemca' },
  { key: 'property', label: 'Nieruchomość' },
  { key: 'type', label: 'Typ' },
  { key: 'active', label: 'Aktywna' },
]

function getTenantData(c: Contract) {
  return c.tenants as unknown as {
    first_name: string
    last_name: string
    properties: { name: string }
  } | null
}

function sortContracts(contracts: Contract[], key: SortKey, dir: SortDir): Contract[] {
  return [...contracts].sort((a, b) => {
    const ta = getTenantData(a)
    const tb = getTenantData(b)
    let va: string | number = ''
    let vb: string | number = ''
    if (key === 'tenant') {
      va = `${ta?.last_name ?? ''} ${ta?.first_name ?? ''}`.toLowerCase()
      vb = `${tb?.last_name ?? ''} ${tb?.first_name ?? ''}`.toLowerCase()
    } else if (key === 'property') {
      va = (ta?.properties?.name ?? '').toLowerCase()
      vb = (tb?.properties?.name ?? '').toLowerCase()
    } else if (key === 'type') {
      va = a.contract_type.toLowerCase()
      vb = b.contract_type.toLowerCase()
    } else if (key === 'amount') {
      va = Number(a.rent_amount)
      vb = Number(b.rent_amount)
    } else if (key === 'number') {
      va = a.invoice_seq_number
      vb = b.invoice_seq_number
    } else if (key === 'from') {
      va = a.start_date
      vb = b.start_date
    } else if (key === 'to') {
      va = a.end_date ?? ''
      vb = b.end_date ?? ''
    } else if (key === 'active') {
      va = a.is_active ? 1 : 0
      vb = b.is_active ? 1 : 0
    }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function matchesContractFilter(c: Contract, text: string, col: string): boolean {
  const q = text.toLowerCase()
  const t = getTenantData(c)
  const tenant = `${t?.first_name ?? ''} ${t?.last_name ?? ''}`.toLowerCase()
  const property = (t?.properties?.name ?? '').toLowerCase()
  const type = c.contract_type.toLowerCase()
  const active = c.is_active ? 'tak' : 'nie'
  if (col === '__all__') return tenant.includes(q) || property.includes(q) || type.includes(q) || active.includes(q)
  if (col === 'tenant') return tenant.includes(q)
  if (col === 'property') return property.includes(q)
  if (col === 'type') return type.includes(q)
  if (col === 'active') return active.includes(q)
  return false
}

function emptyForm() {
  return {
    contract_type: 'PRIVATE',
    rent_amount: '',
    invoice_seq_number: '1',
    opis_rachunku: '',
    opis_rachunku_media: '',
    start_date: '',
    end_date: '',
    indefinite: true,
    is_active: true,
    tenant_id: '',
  }
}

export default function ContractsPage() {
  const queryClient = useQueryClient()
  const { data: contracts = [] } = useQuery({
    queryKey: QUERY_KEYS.contracts,
    queryFn: getContracts,
  })
  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: QUERY_KEYS.tenants,
    queryFn: getTenants,
  })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [pending, startTransition] = useTransition()
  const [sortKey, setSortKey] = useState<SortKey>('tenant')
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
    ? contracts.filter((c) => matchesContractFilter(c, filterText, filterCol))
    : contracts
  const sorted = sortContracts(filtered, sortKey, sortDir)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(c: Contract) {
    setEditing(c)
    setForm({
      contract_type: c.contract_type,
      rent_amount: String(c.rent_amount),
      invoice_seq_number: String(c.invoice_seq_number),
      opis_rachunku: (c as Record<string, unknown>).opis_rachunku as string ?? '',
      opis_rachunku_media: (c as Record<string, unknown>).opis_rachunku_media as string ?? '',
      start_date: c.start_date,
      end_date: c.end_date ?? '',
      indefinite: !c.end_date,
      is_active: c.is_active,
      tenant_id: String(c.tenant_id),
    })
    setOpen(true)
  }

  function handleSave() {
    if (!form.tenant_id || !form.rent_amount || !form.start_date) {
      toast.error('Najemca, kwota i data początku są wymagane.')
      return
    }
    const payload = {
      contract_type: form.contract_type,
      rent_amount: parseFloat(form.rent_amount),
      invoice_seq_number: parseInt(form.invoice_seq_number),
      opis_rachunku: form.opis_rachunku,
      opis_rachunku_media: form.opis_rachunku_media,
      start_date: form.start_date,
      end_date: form.indefinite ? undefined : (form.end_date || undefined),
      is_active: form.is_active,
      tenant_id: Number(form.tenant_id),
    }
    startTransition(async () => {
      if (editing) {
        await updateContract(editing.id, payload)
        toast.success('Umowa zaktualizowana.')
      } else {
        await createContract(payload)
        toast.success('Umowa dodana.')
      }
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.contracts })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tenants })
    })
  }

  function handleDelete(c: Contract) {
    if (!confirm('Usunąć tę umowę?')) return
    startTransition(async () => {
      await deleteContract(c.id)
      toast.success('Umowa usunięta.')
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.contracts })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tenants })
    })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Umowy</h1>
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
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('tenant')}>
              Najemca<SortIcon col="tenant" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('property')}>
              Nieruchomość<SortIcon col="property" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')}>
              Typ<SortIcon col="type" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('amount')}>
              Kwota<SortIcon col="amount" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('number')}>
              Nr<SortIcon col="number" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('from')}>
              Od<SortIcon col="from" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('to')}>
              Do<SortIcon col="to" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('active')}>
              Aktywna<SortIcon col="active" />
            </TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((c) => {
            const tenant = getTenantData(c)
            return (
              <TableRow key={c.id}>
                <TableCell>
                  {tenant?.first_name} {tenant?.last_name}
                </TableCell>
                <TableCell>{tenant?.properties?.name}</TableCell>
                <TableCell>
                  <Badge variant={c.contract_type === 'BUSINESS' ? 'default' : 'secondary'}>
                    {c.contract_type}
                  </Badge>
                </TableCell>
                <TableCell>{formatAmount(Number(c.rent_amount))}</TableCell>
                <TableCell>{c.invoice_seq_number}</TableCell>
                <TableCell>{formatDate(c.start_date)}</TableCell>
                <TableCell>
                  {c.end_date
                    ? formatDate(c.end_date)
                    : <span className="text-muted-foreground text-sm">bezterminowa</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={c.is_active ? 'default' : 'outline'}>
                    {c.is_active ? 'Tak' : 'Nie'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                {filterText ? 'Brak wyników dla podanego filtra' : 'Brak umów'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj umowę' : 'Nowa umowa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Najemca *</Label>
              <SearchSelect
                options={tenants.map((t) => ({
                  value: String(t.id),
                  label: `${t.first_name} ${t.last_name}`,
                  description: (t.properties as unknown as { name: string } | null)?.name,
                }))}
                value={form.tenant_id}
                onValueChange={(v) => setForm({ ...form, tenant_id: v })}
                placeholder="Wyszukaj najemcę..."
              />
            </div>
            <div className="space-y-1">
              <Label>Typ</Label>
              <Select
                value={form.contract_type}
                onValueChange={(v) => setForm({ ...form, contract_type: v ?? 'PRIVATE' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">PRIVATE</SelectItem>
                  <SelectItem value="BUSINESS">BUSINESS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Kwota czynszu *</Label>
              <Input
                value={form.rent_amount}
                onChange={(e) => setForm({ ...form, rent_amount: e.target.value })}
                placeholder="2500.00"
              />
            </div>
            {form.contract_type === 'BUSINESS' && (
              <div className="space-y-1">
                <Label>Nr porządkowy faktury</Label>
                <Input
                  type="number"
                  value={form.invoice_seq_number}
                  onChange={(e) => setForm({ ...form, invoice_seq_number: e.target.value })}
                />
              </div>
            )}
            {form.contract_type === 'BUSINESS' && (
              <div className="space-y-1">
                <Label>Opis rachunku (czynsz)</Label>
                <Input
                  value={form.opis_rachunku}
                  onChange={(e) => setForm({ ...form, opis_rachunku: e.target.value })}
                  placeholder="Czynsz za lokal jp64"
                />
              </div>
            )}
            {form.contract_type === 'BUSINESS' && (
              <div className="space-y-1">
                <Label>Opis rachunku (media)</Label>
                <Input
                  value={form.opis_rachunku_media}
                  onChange={(e) => setForm({ ...form, opis_rachunku_media: e.target.value })}
                  placeholder="Media jp64 lokal 1"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Data od *</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.indefinite}
                onCheckedChange={(v) => setForm({ ...form, indefinite: v, end_date: v ? '' : form.end_date })}
              />
              <Label>Bezterminowa</Label>
            </div>
            {!form.indefinite && (
              <div className="space-y-1">
                <Label>Data do</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label>Aktywna</Label>
            </div>
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
