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
import { Pencil, Trash2, Plus, ExternalLink } from 'lucide-react'

type Tenant = Awaited<ReturnType<typeof getTenants>>[number]
type Property = Awaited<ReturnType<typeof getProperties>>[number]

function emptyForm() {
  return {
    tenant_type: 'PRIVATE',
    first_name: '',
    last_name: '',
    email: '',
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
      email: t.email ?? '',
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
      email: form.email || undefined,
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
      // Kontrakty embedują dane najemców
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.contracts })
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Imię i nazwisko</TableHead>
            <TableHead>Nieruchomość</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Telefon</TableHead>
            <TableHead>Umowy</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">
                {t.first_name} {t.last_name}
              </TableCell>
              <TableCell>
                {(t.properties as unknown as { name: string } | null)?.name}
              </TableCell>
              <TableCell>
                <Badge variant={t.tenant_type === 'BUSINESS' ? 'default' : 'secondary'}>
                  {t.tenant_type}
                </Badge>
              </TableCell>
              <TableCell>{t.email}</TableCell>
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
          {tenants.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                Brak najemców
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
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
              <Select
                value={form.property_id}
                onValueChange={(v) => setForm({ ...form, property_id: v ?? '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz nieruchomość" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name || p.address1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
