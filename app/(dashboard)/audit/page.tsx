'use client'

import { useState, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAuditLogs } from './actions'
import { QUERY_KEYS } from '@/lib/queryKeys'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AuditLog = Awaited<ReturnType<typeof getAuditLogs>>[number]
type SortKey = 'created_at' | 'action_name' | 'table_name' | 'operation'
type SortDir = 'asc' | 'desc'

const OPERATION_LABELS: Record<string, string> = {
  CREATE:  'Dodanie',
  UPDATE:  'Edycja',
  DELETE:  'Usunięcie',
  UPSERT:  'Upsert',
  IMPORT:  'Import',
  DISMISS: 'Odrzucenie',
}

const OPERATION_COLORS: Record<string, string> = {
  CREATE:  'bg-green-100 text-green-800',
  UPDATE:  'bg-blue-100 text-blue-800',
  DELETE:  'bg-red-100 text-red-800',
  UPSERT:  'bg-purple-100 text-purple-800',
  IMPORT:  'bg-orange-100 text-orange-800',
  DISMISS: 'bg-gray-100 text-gray-700',
}

const TABLE_LABELS: Record<string, string> = {
  tenants:             'Najemcy',
  contracts:           'Umowy',
  transactions:        'Transakcje',
  transaction_staging: 'Staging',
  settlement_groups:   'Grupy mediów',
  app_config:          'Ustawienia',
  invoices:            'Rachunki',
}

const ACTION_LABELS: Record<string, string> = {
  createTenant:              'Dodaj najemcę',
  updateTenant:              'Edytuj najemcę',
  deleteTenant:              'Usuń najemcę',
  createContract:            'Dodaj umowę',
  updateContract:            'Edytuj umowę',
  deleteContract:            'Usuń umowę',
  revaluateContract:         'Waloryzuj umowę',
  reconcileTransaction:      'Powiąż transakcję',
  dismissTransaction:        'Odrzuć transakcję',
  importCsvTransactions:     'Import CSV',
  updateTransactionCategory: 'Zmień kategorię',
  upsertAppConfig:           'Edytuj ustawienia',
  createSettlementGroup:     'Dodaj grupę mediów',
  updateSettlementGroup:     'Edytuj grupę mediów',
  deleteSettlementGroup:     'Usuń grupę mediów',
  processSettlement:         'Rozlicz media',
  generateRents:             'Generuj czynsze',
}

const FIELD_LABELS: Record<string, string> = {
  // contracts
  rent_amount:              'Czynsz',
  contract_type:            'Typ umowy',
  start_date:               'Data rozpoczęcia',
  end_date:                 'Data zakończenia',
  is_active:                'Aktywna',
  has_media_invoice:        'Faktura za media',
  opis_rachunku:            'Opis rachunku',
  opis_rachunku_media:      'Opis rachunku (media)',
  tenant_id:                'ID najemcy',
  // tenants
  first_name:               'Imię',
  last_name:                'Nazwisko',
  company_name:             'Firma',
  email:                    'E-mail',
  email2:                   'E-mail 2',
  phone:                    'Telefon',
  bank_accounts_as_text:    'Konta bankowe',
  nip:                      'NIP',
  address1:                 'Adres 1',
  address2:                 'Adres 2',
  property_id:              'ID lokalu',
  tenant_type:              'Typ najemcy',
  sender_account:           'Konto nadawcy',
  // transactions / staging
  amount:                   'Kwota',
  date:                     'Data',
  title:                    'Tytuł',
  bank_account:             'Konto bankowe',
  suggested_tenant_id:      'Sugerowany najemca',
  is_duplicate:             'Duplikat',
  raw_data:                 'Dane surowe',
  type:                     'Typ',
  category:                 'Kategoria',
  status:                   'Status',
  booking_date:             'Data księgowania',
  transaction_date:         'Data transakcji',
  sender_name:              'Nadawca',
  // import summary
  bank:                     'Bank',
  total:                    'Łącznie',
  withSuggestion:           'Z sugestią',
  withoutSuggestion:        'Bez sugestii',
  skipped:                  'Pominięto',
  duplicates:               'Duplikaty',
  // common
  id:                       'ID',
  created_at:               'Utworzono',
  updated_at:               'Zaktualizowano',
}

const MONETARY_FIELDS = new Set(['rent_amount', 'amount'])
const BOOLEAN_FIELDS  = new Set(['is_active', 'has_media_invoice', 'is_duplicate'])
const DATE_FIELDS     = new Set(['start_date', 'end_date', 'date', 'booking_date', 'transaction_date'])
const SKIP_FIELDS     = new Set(['id', 'created_at', 'updated_at'])

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (MONETARY_FIELDS.has(field)) {
    const n = Number(value)
    if (!isNaN(n)) return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(n)
  }
  if (BOOLEAN_FIELDS.has(field)) return value ? 'Tak' : 'Nie'
  if (DATE_FIELDS.has(field) && typeof value === 'string') {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('pl-PL')
  }
  if (typeof value === 'string' && value.length > 120) return value.slice(0, 120) + '…'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

type DiffRow = { field: string; label: string; before: string; after: string }

function computeDiff(before: unknown, after: unknown): DiffRow[] {
  if (!isObj(before) || !isObj(after)) return []
  const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const rows: DiffRow[] = []
  for (const field of allKeys) {
    if (SKIP_FIELDS.has(field)) continue
    const bv = before[field]
    const av = after[field]
    if (String(bv ?? '') === String(av ?? '')) continue
    rows.push({
      field,
      label:  FIELD_LABELS[field] ?? field,
      before: formatFieldValue(field, bv),
      after:  formatFieldValue(field, av),
    })
  }
  return rows
}

function getFields(data: unknown): DiffRow[] {
  if (!isObj(data)) return []
  return Object.entries(data)
    .filter(([k]) => !SKIP_FIELDS.has(k))
    .map(([k, v]) => ({
      field:  k,
      label:  FIELD_LABELS[k] ?? k,
      before: '',
      after:  formatFieldValue(k, v),
    }))
}

const SUMMARY_PRIORITY = ['rent_amount', 'amount', 'start_date', 'end_date', 'date', 'is_active', 'status', 'category']

function getInlineSummary(log: AuditLog): string | null {
  if (log.operation !== 'UPDATE' && log.operation !== 'UPSERT') return null
  const diffs = computeDiff(log.before_data, log.after_data)
  if (diffs.length === 0) return null
  const sorted = [...diffs].sort((a, b) => {
    const ai = SUMMARY_PRIORITY.indexOf(a.field)
    const bi = SUMMARY_PRIORITY.indexOf(b.field)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  return sorted.slice(0, 2).map((d) => `${d.label}: ${d.before} → ${d.after}`).join(' · ')
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function DiffTable({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground italic">Brak zmienionych pól.</p>
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr>
          <th className="text-left text-xs font-semibold text-muted-foreground pb-2 pr-6 w-48">Pole</th>
          <th className="text-left text-xs font-semibold text-muted-foreground pb-2 pr-6">Przed</th>
          <th className="text-left text-xs font-semibold text-muted-foreground pb-2">Po</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.field} className="border-t border-border/40">
            <td className="py-1.5 pr-6 text-xs text-muted-foreground">{row.label}</td>
            <td className="py-1.5 pr-6 text-xs text-muted-foreground">{row.before}</td>
            <td className="py-1.5 text-xs font-medium">{row.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FieldTable({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) return null
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr>
          <th className="text-left text-xs font-semibold text-muted-foreground pb-2 pr-6 w-48">Pole</th>
          <th className="text-left text-xs font-semibold text-muted-foreground pb-2">Wartość</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.field} className="border-t border-border/40">
            <td className="py-1.5 pr-6 text-xs text-muted-foreground">{row.label}</td>
            <td className="py-1.5 text-xs">{row.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  if (data === null || data === undefined) return null
  return (
    <div className="mt-2">
      <div className="text-xs font-semibold text-muted-foreground mb-1">{label}</div>
      <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-64">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function DetailPanel({ log }: { log: AuditLog }) {
  const [showRaw, setShowRaw] = useState(false)
  const op = log.operation

  let mainContent: React.ReactNode = null
  if (op === 'UPDATE' || op === 'UPSERT') {
    if (op === 'UPSERT' && !isObj(log.before_data)) {
      mainContent = <FieldTable rows={getFields(log.after_data)} />
    } else {
      mainContent = <DiffTable rows={computeDiff(log.before_data, log.after_data)} />
    }
  } else if (op === 'CREATE') {
    mainContent = <FieldTable rows={getFields(log.after_data)} />
  } else if (op === 'DELETE') {
    mainContent = <FieldTable rows={getFields(log.before_data)} />
  } else if (op === 'DISMISS' || op === 'IMPORT') {
    mainContent = <FieldTable rows={getFields(log.after_data ?? log.before_data)} />
  }

  const hasRaw = log.before_data !== null || log.after_data !== null

  return (
    <div className="space-y-3">
      {mainContent}
      {log.error_data && (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
          <div className="text-xs font-semibold text-destructive mb-1">BŁĄD</div>
          <pre className="text-xs text-destructive overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(log.error_data, null, 2)}
          </pre>
        </div>
      )}
      {hasRaw && (
        <div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => { e.stopPropagation(); setShowRaw((v) => !v) }}
          >
            {showRaw ? '▲ Ukryj surowe dane JSON' : '▼ Pokaż surowe dane JSON'}
          </button>
          {showRaw && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mt-2">
              <JsonBlock data={log.before_data} label="PRZED" />
              <JsonBlock data={log.after_data} label="PO" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AuditPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.auditLog,
    queryFn: getAuditLogs,
  })

  const [sortKey, setSortKey]           = useState<SortKey>('created_at')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')
  const [filterText, setFilterText]     = useState('')
  const [filterOperation, setFilterOperation] = useState('__all__')
  const [filterTable, setFilterTable]   = useState('__all__')
  const [expandedId, setExpandedId]     = useState<number | null>(null)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'created_at' ? 'desc' : 'asc')
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground inline" />
    return sortDir === 'asc'
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />
  }

  const allOperations = [...new Set(logs.map((l) => l.operation))].sort()
  const allTables     = [...new Set(logs.map((l) => l.table_name).filter(Boolean))].sort() as string[]

  const filtered = logs.filter((l) => {
    if (filterOperation !== '__all__' && l.operation !== filterOperation) return false
    if (filterTable !== '__all__' && l.table_name !== filterTable) return false
    if (filterText) {
      const q = filterText.toLowerCase()
      const label = (ACTION_LABELS[l.action_name] ?? l.action_name).toLowerCase()
      if (!label.includes(q) && !l.action_name.toLowerCase().includes(q) && !(l.record_id ?? '').includes(q)) return false
    }
    if (l.operation === 'UPDATE' && !l.error_data && computeDiff(l.before_data, l.after_data).length === 0) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let va = ''
    let vb = ''
    if (sortKey === 'created_at')  { va = a.created_at; vb = b.created_at }
    else if (sortKey === 'action_name') { va = (ACTION_LABELS[a.action_name] ?? a.action_name).toLowerCase(); vb = (ACTION_LABELS[b.action_name] ?? b.action_name).toLowerCase() }
    else if (sortKey === 'table_name')  { va = (TABLE_LABELS[a.table_name ?? ''] ?? a.table_name ?? '').toLowerCase(); vb = (TABLE_LABELS[b.table_name ?? ''] ?? b.table_name ?? '').toLowerCase() }
    else if (sortKey === 'operation')   { va = a.operation; vb = b.operation }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Historia operacji</h1>
        <div className="text-sm text-muted-foreground">{filtered.length} z {logs.length} wpisów</div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8"
            placeholder="Szukaj akcji..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full w-8 hover:bg-transparent"
              onClick={() => setFilterText('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <Select value={filterOperation} onValueChange={(v) => setFilterOperation(v ?? '__all__')}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {filterOperation === '__all__' ? 'Wszystkie operacje' : (OPERATION_LABELS[filterOperation] ?? filterOperation)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Wszystkie operacje</SelectItem>
            {allOperations.map((op) => (
              <SelectItem key={op} value={op}>{OPERATION_LABELS[op] ?? op}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTable} onValueChange={(v) => setFilterTable(v ?? '__all__')}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {filterTable === '__all__' ? 'Wszystkie tabele' : (TABLE_LABELS[filterTable] ?? filterTable)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Wszystkie tabele</SelectItem>
            {allTables.map((t) => (
              <SelectItem key={t} value={t}>{TABLE_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none w-44" onClick={() => handleSort('created_at')}>
              Czas<SortIcon col="created_at" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('action_name')}>
              Akcja<SortIcon col="action_name" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => handleSort('table_name')}>
              Tabela<SortIcon col="table_name" />
            </TableHead>
            <TableHead className="cursor-pointer select-none w-32" onClick={() => handleSort('operation')}>
              Operacja<SortIcon col="operation" />
            </TableHead>
            <TableHead className="w-24">ID rekordu</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Ładowanie…</TableCell>
            </TableRow>
          )}
          {!isLoading && sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Brak wpisów</TableCell>
            </TableRow>
          )}
          {sorted.map((log) => {
            const isExpanded = expandedId === log.id
            const hasError   = log.error_data !== null
            const summary    = getInlineSummary(log)
            return (
              <Fragment key={log.id}>
                <TableRow
                  className={cn('cursor-pointer', isExpanded ? 'bg-muted/50' : 'hover:bg-muted/30')}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{ACTION_LABELS[log.action_name] ?? log.action_name}</div>
                    {summary && <div className="text-xs text-muted-foreground mt-0.5">{summary}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {TABLE_LABELS[log.table_name ?? ''] ?? log.table_name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold', OPERATION_COLORS[log.operation] ?? 'bg-gray-100 text-gray-700')}>
                      {OPERATION_LABELS[log.operation] ?? log.operation}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.record_id ?? '—'}
                  </TableCell>
                  <TableCell>
                    {hasError && <AlertCircle className="h-4 w-4 text-destructive" aria-label="Błąd" />}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={6} className="px-6 pb-4 pt-2">
                      <DetailPanel log={log} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
