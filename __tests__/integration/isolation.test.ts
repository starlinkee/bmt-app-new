/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ISOLATION_BUCKETS,
  anonClient,
  createIsolationUser,
  serviceClient,
  wipeAndDeleteUsers,
  type IsolationUser,
} from '../../tests-support/isolationUsers'
import { E2E_PREFIX } from '../../tests-support/db'

// Dowód izolacji kont: sesja konta A nie czyta ani nie zmienia danych konta B w żadnej tabeli
// z `owner_id` (ani w `profiles`, ani w storage), a anon nie widzi nic. Klienci to PRAWDZIWE sesje
// (supabase-js + klucz anon + signInWithPassword), nie zamockowany klient service z setup.ts.
// Wynik każdej komórki trafia do raportu docs/roadmap/isolation-matrix.md (generowany przez ten test).

type Row = Record<string, any>
type Graph = { owner: string; property: number; property2: number; tenant: number; group: number; audit: number; transaction: number }
type Spec = {
  pk: string[]
  /** Wiersz do wstawienia; `owner` pominięty = brak owner_id (zadziała DEFAULT = auth.uid()). */
  build: (g: Graph, owner?: string) => Row
  /** Zmiana używana w próbach UPDATE; liczona z grafu konta, na którego wierszu działamy. */
  patch: (g: Graph) => Row
  /** Tabela z jednym wierszem na konto (zakładany triggerem) - bez prób INSERT/DELETE własnego wiersza. */
  singleRow?: boolean
}

const u = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const tag = (label: string) => `${E2E_PREFIX}iso ${label} ${u()}`
const withOwner = (row: Row, owner?: string): Row => (owner ? { ...row, owner_id: owner } : row)

const SPECS: Record<string, Spec> = {
  properties: {
    pk: ['id'],
    build: (_g, o) => withOwner({ name: tag('nieruchomość'), address1: 'ul. Testowa 1', type: 'Mieszkanie' }, o),
    patch: () => ({ address1: 'zmienione' }),
  },
  tenants: {
    pk: ['id'],
    build: (g, o) => withOwner({ first_name: 'Iso', last_name: tag('najemca'), property_id: g.property }, o),
    patch: () => ({ phone: '000000000' }),
  },
  contracts: {
    pk: ['id'],
    build: (g, o) => withOwner({ contract_type: 'PRIVATE', rent_amount: 1, start_date: '2001-01-01', is_active: false, tenant_id: g.tenant }, o),
    patch: () => ({ rent_amount: 2 }),
  },
  invoices: {
    pk: ['id'],
    build: (g, o) => withOwner({ type: 'RENT', amount: 1, month: 1, year: 2001, tenant_id: g.tenant, source: 'MANUAL' }, o),
    patch: () => ({ amount: 2 }),
  },
  transactions: {
    pk: ['id'],
    build: (g, o) =>
      withOwner({ type: 'BANK', status: 'MATCHED', amount: 1, date: '2001-01-15', title: tag('wpłata'), tenant_id: g.tenant }, o),
    patch: () => ({ description: 'zmienione' }),
  },
  transaction_staging: {
    pk: ['id'],
    build: (_g, o) => withOwner({ amount: 1, date: '2001-01-15', title: tag('staging') }, o),
    patch: () => ({ bank_account: 'zmienione' }),
  },
  transaction_amendments: {
    pk: ['id'],
    build: (g, o) => withOwner({ transaction_id: g.transaction, before_data: {}, after_data: {} }, o),
    patch: () => ({ note: 'zmienione' }),
  },
  settlement_groups: {
    pk: ['id'],
    build: (_g, o) =>
      withOwner(
        { name: tag('grupa'), spreadsheet_id: 'iso', input_mapping_json: {}, output_mapping_json: [], pdf_sheets_json: [], tenant_reading_keys: {} },
        o,
      ),
    patch: () => ({ spreadsheet_id: 'zmienione' }),
  },
  settlement_group_properties: {
    pk: ['settlement_group_id', 'property_id'],
    // Para (grupa, nieruchomość) jest kluczem - nowy wiersz dostaje świeżą nieruchomość, przygotowaną w grafie przez `spare`.
    build: (g, o) => withOwner({ settlement_group_id: g.group, property_id: g.property2 }, o),
    patch: (g) => ({ property_id: g.property }),
  },
  media_settlements: {
    pk: ['id'],
    build: (g, o) => withOwner({ group_id: g.group, month: 1, year: 2100 + Math.floor(Math.random() * 800), spreadsheet_id: 'iso', drive_pdf_ids: [] }, o),
    patch: () => ({ spreadsheet_id: 'zmienione' }),
  },
  media_meter_readings: {
    pk: ['id'],
    build: (g, o) => withOwner({ group_id: g.group, month: 1, year: 2001, key: `iso_${u()}`, value: 1 }, o),
    patch: () => ({ value: 2 }),
  },
  operation_log: {
    pk: ['id'],
    build: (_g, o) => withOwner({ operation: `${E2E_PREFIX}iso ${u()}` }, o),
    patch: () => ({ operation: 'zmienione' }),
  },
  audit_log: {
    pk: ['id'],
    build: (_g, o) => withOwner({ action_name: `${E2E_PREFIX}iso`, operation: 'INSERT' }, o),
    patch: () => ({ operation: 'UPDATE' }),
  },
  email_logs: {
    pk: ['id'],
    build: (_g, o) => withOwner({ to_email: `${E2E_PREFIX.toLowerCase()}iso_${u()}@example.invalid`, subject: tag('temat') }, o),
    patch: () => ({ subject: 'zmienione' }),
  },
  reminder_dedup: {
    pk: ['id'],
    build: (_g, o) => withOwner({ action_name: `${E2E_PREFIX}iso`, dedup_key: `iso_${u()}` }, o),
    patch: () => ({ dedup_key: `zmienione_${u()}` }),
  },
  skill_prompts: {
    pk: ['owner_id', 'id'],
    build: (g, o) => withOwner({ id: `${E2E_PREFIX.toLowerCase()}iso_${u()}`, label: 'iso', prompt: 'iso', settlement_group_id: g.group }, o),
    patch: () => ({ label: 'zmienione' }),
  },
  app_config: {
    pk: ['owner_id'],
    singleRow: true,
    build: (_g, o) => withOwner({}, o),
    patch: () => ({ admin_email: 'zmienione@example.invalid' }),
  },
  profiles: {
    pk: ['id'],
    singleRow: true,
    build: (g) => ({ id: g.owner, email: 'iso@example.invalid' }),
    patch: () => ({ full_name: 'zmienione' }),
  },
}

// Tabele celowo bez dostępu dla ról użytkowników (REVOKE ALL) - sprawdzane osobno poniżej.
const SERVICE_ONLY = ['legacy_owner', 'google_credentials']
// Tabele tylko do odczytu dla właściciela: authenticated czyta własny wiersz (RLS), zapis wyłącznie rolą service.
const READ_ONLY = ['google_connections']
// Tabele globalne, świadomie bez owner_id (wyjątek opisany w raporcie).
const GLOBAL_TABLES = ['system_settings']

const REPORT_PATH = path.resolve(__dirname, '../../docs/roadmap/isolation-matrix.md')
const COLUMNS = [
  ['selB', 'A: SELECT wiersza B'],
  ['updB', 'A: UPDATE wiersza B'],
  ['delB', 'A: DELETE wiersza B'],
  ['insB', 'A: INSERT z owner_id=B'],
  ['selA', 'A: SELECT własnego'],
  ['updA', 'A: UPDATE własnego'],
  ['insA', 'A: INSERT bez owner_id'],
  ['delA', 'A: DELETE własnego'],
  ['anSel', 'anon: SELECT'],
  ['anIns', 'anon: INSERT'],
  ['anUpd', 'anon: UPDATE'],
  ['anDel', 'anon: DELETE'],
] as const
type ColKey = (typeof COLUMNS)[number][0]

const cells = new Map<string, Partial<Record<ColKey, string>>>()
const storageCells: { name: string; result: string }[] = []

function record(table: string, col: ColKey, ok: boolean, detail: string) {
  const row = cells.get(table) ?? {}
  row[col] = `${ok ? 'OK' : 'PRZECIEK'} (${detail})`
  cells.set(table, row)
}

const errCode = (error: { code?: string; message?: string } | null) => error?.code ?? (error ? 'błąd' : '')
// Odmowa dostępu: brak uprawnień (42501) albo naruszenie polityki RLS (42501) - inne kody nie liczą się jako izolacja.
const denied = (error: { code?: string } | null) => error?.code === '42501'

function matchOf(spec: Spec, row: Row): Row {
  return Object.fromEntries(spec.pk.map((k) => [k, row[k]]))
}

let admin: SupabaseClient<any>
let A: IsolationUser
let B: IsolationUser
let anon: SupabaseClient<any>
const graphs = new Map<string, Graph>()
const rowsOfB = new Map<string, Row>()
const rowsOfA = new Map<string, Row>()
let openApiTables: { withOwner: string[]; all: string[] } = { withOwner: [], all: [] }

async function ins(table: string, row: Row): Promise<Row> {
  const { data, error } = await admin.from(table).insert(row).select().single()
  if (error) throw new Error(`seed ${table}: ${error.message}`)
  return data
}

async function buildGraph(owner: string): Promise<Graph> {
  const property = await ins('properties', { owner_id: owner, name: tag('rodzic'), address1: 'ul. Testowa 1', type: 'Mieszkanie' })
  const property2 = await ins('properties', { owner_id: owner, name: tag('rodzic2'), address1: 'ul. Testowa 2', type: 'Mieszkanie' })
  const tenant = await ins('tenants', { owner_id: owner, first_name: 'Iso', last_name: tag('rodzic'), property_id: property.id })
  const group = await ins('settlement_groups', {
    owner_id: owner,
    name: tag('rodzic'),
    spreadsheet_id: 'iso',
    input_mapping_json: {},
    output_mapping_json: [],
    pdf_sheets_json: [],
    tenant_reading_keys: {},
  })
  const audit = await ins('audit_log', { owner_id: owner, action_name: `${E2E_PREFIX}iso`, operation: 'INSERT' })
  const transaction = await ins('transactions', {
    owner_id: owner,
    type: 'BANK',
    status: 'MATCHED',
    amount: 1,
    date: '2001-01-15',
    title: tag('rodzic'),
    tenant_id: tenant.id,
  })
  return { owner, property: property.id, property2: property2.id, tenant: tenant.id, group: group.id, audit: audit.id, transaction: transaction.id }
}

async function seedRow(table: string, owner: string): Promise<Row> {
  const spec = SPECS[table]
  const g = graphs.get(owner)!
  if (table === 'app_config' || table === 'profiles') {
    // Wiersz założył trigger handle_new_user.
    const { data, error } = await admin.from(table).select('*').match(table === 'profiles' ? { id: owner } : { owner_id: owner }).single()
    if (error) throw new Error(`seed ${table}: ${error.message}`)
    return data
  }
  if (table === 'settlement_group_properties') {
    // Własna nieruchomość na wiersz, żeby nie kolidować z kluczem (grupa, nieruchomość).
    const p = await ins('properties', { owner_id: owner, name: tag('sgp'), address1: 'ul. Testowa 3', type: 'Mieszkanie' })
    return ins(table, { owner_id: owner, settlement_group_id: g.group, property_id: p.id })
  }
  return ins(table, spec.build(g, owner))
}

beforeAll(async () => {
  admin = serviceClient({ strict: true })
  anon = anonClient()
  A = await createIsolationUser(admin, 'a')
  B = await createIsolationUser(admin, 'b')

  // Kasowanie w invoices/transactions jest domyślnie blokowane triggerem; na preview flaga globalna to dopuszcza,
  // ale gdyby była wyłączona, kontrola "A kasuje własny wiersz" pokazałaby to wprost.
  for (const owner of [A.id, B.id]) graphs.set(owner, await buildGraph(owner))
  for (const table of Object.keys(SPECS)) {
    rowsOfB.set(table, await seedRow(table, B.id))
    rowsOfA.set(table, await seedRow(table, A.id))
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      accept: 'application/openapi+json',
    },
  })
  const defs = ((await res.json()) as { definitions: Record<string, { properties: Record<string, unknown> }> }).definitions
  openApiTables = {
    all: Object.keys(defs),
    withOwner: Object.entries(defs)
      .filter(([, d]) => 'owner_id' in d.properties)
      .map(([t]) => t),
  }
}, 180_000)

afterAll(async () => {
  try {
    writeReport()
  } finally {
    if (A && B) await wipeAndDeleteUsers(admin, [A.id, B.id])
  }
}, 180_000)

describe('lista tabel (strażnik)', () => {
  test('każda tabela z kolumną owner_id (z OpenAPI bazy) ma wpis w macierzy albo jest jawnie service-only', () => {
    const covered = new Set([...Object.keys(SPECS), ...SERVICE_ONLY, ...READ_ONLY])
    const missing = openApiTables.withOwner.filter((t) => !covered.has(t))
    expect(missing, `Tabele z owner_id bez pokrycia w isolation.test.ts: ${missing.join(', ')}`).toEqual([])
  })

  test('wpisy macierzy odpowiadają istniejącym tabelom', () => {
    const stale = [...Object.keys(SPECS), ...SERVICE_ONLY, ...READ_ONLY].filter((t) => !openApiTables.all.includes(t))
    expect(stale).toEqual([])
  })

  test('tabele globalne bez owner_id to wyłącznie znane wyjątki', () => {
    const noOwner = openApiTables.all.filter((t) => !openApiTables.withOwner.includes(t))
    const unexpected = noOwner.filter((t) => t !== 'profiles' && !GLOBAL_TABLES.includes(t))
    expect(unexpected, `Nowa tabela bez owner_id - dodaj ją do macierzy albo świadomie do GLOBAL_TABLES: ${unexpected.join(', ')}`).toEqual([])
  })
})

describe.each(Object.entries(SPECS))('izolacja: %s', (table, spec) => {
  const rowB = () => rowsOfB.get(table)!
  const rowA = () => rowsOfA.get(table)!
  const gB = () => graphs.get(B.id)!
  const gA = () => graphs.get(A.id)!
  const reread = async (row: Row) => (await admin.from(table).select('*').match(matchOf(spec, row)).maybeSingle()).data as Row | null

  test('A: SELECT wiersza B -> 0 wierszy', async () => {
    const { data, error } = await A.client.from(table).select('*').match(matchOf(spec, rowB()))
    record(table, 'selB', !error && data?.length === 0, error ? errCode(error) : `${data?.length} wierszy`)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  test('A: UPDATE wiersza B -> 0 zmienionych, wiersz bez zmian', async () => {
    const patch = spec.patch(gB())
    const { data, error } = await A.client.from(table).update(patch).match(matchOf(spec, rowB())).select()
    const after = await reread(rowB())
    const [col, value] = Object.entries(patch)[0]
    const unchanged = !!after && after[col] === rowB()[col] && after[col] !== value
    record(table, 'updB', !error && data?.length === 0 && unchanged, error ? errCode(error) : `${data?.length} zmienionych`)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
    expect(unchanged).toBe(true)
  })

  test('A: DELETE wiersza B -> wiersz dalej istnieje', async () => {
    const { data, error } = await A.client.from(table).delete().match(matchOf(spec, rowB())).select()
    const after = await reread(rowB())
    record(table, 'delB', !error && data?.length === 0 && !!after, error ? errCode(error) : `${data?.length} usuniętych`)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
    expect(after).not.toBeNull()
  })

  test('A: INSERT z owner_id=B -> błąd RLS (42501)', async () => {
    // profiles nie ma owner_id: próba podszycia się pod id konta B.
    const row = table === 'profiles' ? { id: B.id, email: 'iso@example.invalid' } : spec.build(gB(), B.id)
    const { error } = await A.client.from(table).insert(row).select()
    record(table, 'insB', denied(error), errCode(error) || 'wstawiono')
    expect(error?.code).toBe('42501')
  })

  test('kontrola pozytywna: A czyta swój wiersz', async () => {
    const { data, error } = await A.client.from(table).select('*').match(matchOf(spec, rowA()))
    record(table, 'selA', !error && data?.length === 1, error ? errCode(error) : `${data?.length} wiersz`)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  test('kontrola pozytywna: A zmienia swój wiersz', async () => {
    const patch = spec.patch(gA())
    const { data, error } = await A.client.from(table).update(patch).match(matchOf(spec, rowA())).select()
    record(table, 'updA', !error && data?.length === 1, error ? errCode(error) : `${data?.length} zmieniony`)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    // Zmiana może dotyczyć kolumny klucza (settlement_group_properties) - dalsze próby idą po nowym kluczu.
    rowsOfA.set(table, { ...rowA(), ...patch })
    const after = await reread(rowA())
    const [col, value] = Object.entries(patch)[0]
    expect(after?.[col]).toEqual(value)
  })

  test('kontrola pozytywna: A wstawia wiersz bez owner_id -> owner_id = A', async () => {
    if (spec.singleRow) {
      record(table, 'insA', true, 'n/d: jeden wiersz na konto')
      return
    }
    const { data, error } = await A.client.from(table).insert(spec.build(gA())).select().single()
    record(table, 'insA', !error && data?.owner_id === A.id, error ? errCode(error) : 'owner_id = A')
    expect(error).toBeNull()
    expect(data?.owner_id).toBe(A.id)
  })

  test('kontrola pozytywna: A usuwa swój wiersz', async () => {
    if (spec.singleRow) {
      record(table, 'delA', true, 'n/d: jeden wiersz na konto')
      return
    }
    const { data, error } = await A.client.from(table).delete().match(matchOf(spec, rowA())).select()
    record(table, 'delA', !error && data?.length === 1, error ? errCode(error) : `${data?.length} usunięty`)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  test('anon: SELECT -> 0 wierszy albo odmowa', async () => {
    const { data, error } = await anon.from(table).select('*').match(matchOf(spec, rowB()))
    const ok = error ? denied(error) : data?.length === 0
    record(table, 'anSel', ok, error ? errCode(error) : '0 wierszy')
    expect(ok).toBe(true)
  })

  test('anon: INSERT -> błąd', async () => {
    const row = table === 'profiles' ? { id: B.id, email: 'iso@example.invalid' } : spec.build(gB(), B.id)
    const { error } = await anon.from(table).insert(row).select()
    record(table, 'anIns', denied(error), errCode(error) || 'wstawiono')
    expect(error?.code).toBe('42501')
  })

  test('anon: UPDATE i DELETE -> nic się nie zmienia', async () => {
    const patch = spec.patch(gB())
    const upd = await anon.from(table).update(patch).match(matchOf(spec, rowB())).select()
    const del = await anon.from(table).delete().match(matchOf(spec, rowB())).select()
    const after = await reread(rowB())
    const [col, value] = Object.entries(patch)[0]
    const updOk = (upd.error ? denied(upd.error) : upd.data?.length === 0) && after?.[col] !== value
    const delOk = (del.error ? denied(del.error) : del.data?.length === 0) && !!after
    record(table, 'anUpd', updOk, upd.error ? errCode(upd.error) : '0 zmienionych')
    record(table, 'anDel', delOk, del.error ? errCode(del.error) : '0 usuniętych')
    expect(updOk).toBe(true)
    expect(delOk).toBe(true)
  })
})

// Wiersz sekretu wstawiany rolą service; treść nie ma znaczenia (nikt tu nie odszyfrowuje).
const fakeCredential = (owner: string) => ({ owner_id: owner, refresh_token_ct: '\\xdeadbeef', iv: '\\x000000000000000000000000', key_version: 1 })

describe('google_credentials (service-only)', () => {
  beforeAll(async () => {
    for (const owner of [A.id, B.id]) await ins('google_credentials', fakeCredential(owner))
  })

  test.each([
    ['A (authenticated)', () => A.client],
    ['anon', () => anon],
  ])('%s nie ma żadnego dostępu do żadnego wiersza', async (name, client) => {
    const c = client()
    const sel = await c.from('google_credentials').select('*')
    const selB = await c.from('google_credentials').select('*').eq('owner_id', B.id)
    const selA = await c.from('google_credentials').select('*').eq('owner_id', A.id)
    const upd = await c.from('google_credentials').update({ key_version: 9 }).eq('owner_id', B.id).select()
    const updA = await c.from('google_credentials').update({ key_version: 9 }).eq('owner_id', A.id).select()
    const del = await c.from('google_credentials').delete().eq('owner_id', B.id).select()
    const delA = await c.from('google_credentials').delete().eq('owner_id', A.id).select()
    const insB = await c.from('google_credentials').insert({ ...fakeCredential(B.id), owner_id: B.id }).select()
    const insA = await c.from('google_credentials').insert({ ...fakeCredential(A.id), owner_id: A.id }).select()
    for (const r of [sel, selB, selA, upd, updA, del, delA, insB, insA]) expect(r.error?.code).toBe('42501')

    const { data } = await admin.from('google_credentials').select('owner_id, key_version').in('owner_id', [A.id, B.id])
    expect(data).toHaveLength(2)
    expect(data!.every((r) => r.key_version === 1)).toBe(true)

    cells.set(`google_credentials (${name})`, {
      selB: `${denied(selB.error) ? 'OK' : 'PRZECIEK'} (${errCode(selB.error)})`,
      updB: `${denied(upd.error) ? 'OK' : 'PRZECIEK'} (${errCode(upd.error)})`,
      delB: `${denied(del.error) ? 'OK' : 'PRZECIEK'} (${errCode(del.error)})`,
      insB: `${denied(insB.error) ? 'OK' : 'PRZECIEK'} (${errCode(insB.error)})`,
      selA: `${denied(selA.error) ? 'OK' : 'PRZECIEK'} (${errCode(selA.error)})`,
      updA: `${denied(updA.error) ? 'OK' : 'PRZECIEK'} (${errCode(updA.error)})`,
      insA: `${denied(insA.error) ? 'OK' : 'PRZECIEK'} (${errCode(insA.error)})`,
      delA: `${denied(delA.error) ? 'OK' : 'PRZECIEK'} (${errCode(delA.error)})`,
    })
  })
})

describe('google_connections (tylko odczyt własnego wiersza)', () => {
  const t = 'google_connections'
  let rowA: Row
  let rowB: Row
  const connection = (owner: string) => ({ owner_id: owner, status: 'connected', google_email: `${E2E_PREFIX}iso@example.invalid`, scopes: ['gmail.send'] })
  const reread = async (owner: string) => (await admin.from(t).select('*').eq('owner_id', owner).maybeSingle()).data as Row | null

  beforeAll(async () => {
    rowA = await ins(t, connection(A.id))
    rowB = await ins(t, connection(B.id))
  })

  test('A: SELECT wiersza B -> 0 wierszy', async () => {
    const { data, error } = await A.client.from(t).select('*').eq('owner_id', B.id)
    record(t, 'selB', !error && data?.length === 0, error ? errCode(error) : `${data?.length} wierszy`)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  test('A: UPDATE i DELETE wiersza B -> odmowa, wiersz bez zmian', async () => {
    const upd = await A.client.from(t).update({ status: 'disconnected' }).eq('owner_id', B.id).select()
    const del = await A.client.from(t).delete().eq('owner_id', B.id).select()
    const after = await reread(B.id)
    record(t, 'updB', denied(upd.error), errCode(upd.error) || 'zmieniono')
    record(t, 'delB', denied(del.error), errCode(del.error) || 'usunięto')
    expect(upd.error?.code).toBe('42501')
    expect(del.error?.code).toBe('42501')
    expect(after?.status).toBe('connected')
  })

  test('A: INSERT z owner_id=B -> odmowa', async () => {
    const { error } = await A.client.from(t).insert({ ...connection(B.id), owner_id: B.id }).select()
    record(t, 'insB', denied(error), errCode(error) || 'wstawiono')
    expect(error?.code).toBe('42501')
  })

  test('kontrola pozytywna: A czyta własny wiersz (i tylko jego)', async () => {
    const { data, error } = await A.client.from(t).select('*')
    record(t, 'selA', !error && data?.length === 1 && data[0].owner_id === A.id, error ? errCode(error) : `${data?.length} wiersz`)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].owner_id).toBe(A.id)
    expect(data![0].google_email).toBe(rowA.google_email)
  })

  test('A: UPDATE, INSERT i DELETE własnego wiersza -> odmowa (zapis tylko rolą service)', async () => {
    const upd = await A.client.from(t).update({ status: 'disconnected' }).eq('owner_id', A.id).select()
    const ins2 = await A.client.from(t).insert(connection(A.id)).select()
    const del = await A.client.from(t).delete().eq('owner_id', A.id).select()
    const after = await reread(A.id)
    record(t, 'updA', denied(upd.error), errCode(upd.error) || 'zmieniono')
    record(t, 'insA', denied(ins2.error), errCode(ins2.error) || 'wstawiono')
    record(t, 'delA', denied(del.error), errCode(del.error) || 'usunięto')
    expect(upd.error?.code).toBe('42501')
    expect(ins2.error?.code).toBe('42501')
    expect(del.error?.code).toBe('42501')
    expect(after?.status).toBe('connected')
  })

  test('anon: nic nie czyta ani nie zmienia', async () => {
    const sel = await anon.from(t).select('*').eq('owner_id', B.id)
    const ins2 = await anon.from(t).insert(connection(B.id)).select()
    const upd = await anon.from(t).update({ status: 'disconnected' }).eq('owner_id', B.id).select()
    const del = await anon.from(t).delete().eq('owner_id', B.id).select()
    const after = await reread(B.id)
    record(t, 'anSel', denied(sel.error), errCode(sel.error) || `${sel.data?.length} wierszy`)
    record(t, 'anIns', denied(ins2.error), errCode(ins2.error) || 'wstawiono')
    record(t, 'anUpd', denied(upd.error), errCode(upd.error) || 'zmieniono')
    record(t, 'anDel', denied(del.error), errCode(del.error) || 'usunięto')
    for (const r of [sel, ins2, upd, del]) expect(r.error?.code).toBe('42501')
    expect(after?.status).toBe(rowB.status)
  })
})

describe('legacy_owner (service-only)', () => {
  test.each([
    ['A (authenticated)', () => A.client],
    ['anon', () => anon],
  ])('%s nie ma żadnego dostępu', async (_name, client) => {
    const c = client()
    const sel = await c.from('legacy_owner').select('*')
    const upd = await c.from('legacy_owner').update({ owner_id: A.id }).eq('id', 1).select()
    const del = await c.from('legacy_owner').delete().eq('id', 1).select()
    const insert = await c.from('legacy_owner').insert({ id: 2, owner_id: A.id }).select()
    for (const r of [sel, upd, del, insert]) expect(r.error?.code).toBe('42501')
    const { data } = await admin.from('legacy_owner').select('owner_id').eq('id', 1).single()
    expect(data?.owner_id).not.toBe(A.id)
    cells.set(`legacy_owner (${_name})`, {
      selB: `${denied(sel.error) ? 'OK' : 'PRZECIEK'} (${errCode(sel.error)})`,
      updB: `${denied(upd.error) ? 'OK' : 'PRZECIEK'} (${errCode(upd.error)})`,
      delB: `${denied(del.error) ? 'OK' : 'PRZECIEK'} (${errCode(del.error)})`,
      insB: `${denied(insert.error) ? 'OK' : 'PRZECIEK'} (${errCode(insert.error)})`,
    })
  })

  test('system_settings (tabela globalna) jest zamknięta dla authenticated i anon', async () => {
    for (const c of [A.client, anon]) {
      const sel = await c.from('system_settings').select('*')
      expect(sel.error?.code).toBe('42501')
    }
  })
})

describe('storage', () => {
  const fileName = () => `${E2E_PREFIX}iso_${u()}.txt`
  const body = () => new Blob(['iso'], { type: 'text/plain' })
  const fileB: Record<string, string> = {}

  beforeAll(async () => {
    for (const bucket of ISOLATION_BUCKETS) {
      fileB[bucket] = `${B.id}/${fileName()}`
      const { error } = await admin.storage.from(bucket).upload(fileB[bucket], body(), { contentType: 'text/plain' })
      if (error) throw new Error(`seed storage ${bucket}: ${error.message}`)
    }
  })

  const exists = async (bucket: string, p: string) => {
    const { data } = await admin.storage.from(bucket).list(path.posix.dirname(p), { search: path.posix.basename(p) })
    return (data ?? []).some((f) => f.name === path.posix.basename(p))
  }
  const note = (name: string, ok: boolean, detail: string) => storageCells.push({ name, result: `${ok ? 'OK' : 'PRZECIEK'} (${detail})` })

  describe.each(ISOLATION_BUCKETS)('bucket %s', (bucket) => {
    test('A: upload pod prefiksem B -> błąd', async () => {
      const { error } = await A.client.storage.from(bucket).upload(`${B.id}/${fileName()}`, body())
      note(`${bucket}: A upload pod <B>/`, !!error, error ? 'odmowa' : 'wgrano')
      expect(error).not.toBeNull()
    })

    test('A: upload bez prefiksu konta -> błąd', async () => {
      const { error } = await A.client.storage.from(bucket).upload(fileName(), body())
      note(`${bucket}: A upload bez prefiksu`, !!error, error ? 'odmowa' : 'wgrano')
      expect(error).not.toBeNull()
    })

    test('A: list(<B>) -> puste', async () => {
      const { data, error } = await A.client.storage.from(bucket).list(B.id)
      note(`${bucket}: A list <B>/`, !error && (data ?? []).length === 0, error ? 'odmowa' : `${data?.length} plików`)
      expect(error).toBeNull()
      expect(data ?? []).toHaveLength(0)
    })

    test('A: download pliku B -> błąd', async () => {
      const { data, error } = await A.client.storage.from(bucket).download(fileB[bucket])
      note(`${bucket}: A download pliku B`, !!error && !data, error ? 'odmowa' : 'pobrano')
      expect(error).not.toBeNull()
    })

    test('A: createSignedUrl pliku B -> błąd', async () => {
      const { data, error } = await A.client.storage.from(bucket).createSignedUrl(fileB[bucket], 60)
      note(`${bucket}: A signed URL pliku B`, !!error && !(data as any)?.signedUrl, error ? 'odmowa' : 'wystawiono')
      expect(error).not.toBeNull()
    })

    test('A: remove pliku B -> plik dalej istnieje', async () => {
      const { data } = await A.client.storage.from(bucket).remove([fileB[bucket]])
      const still = await exists(bucket, fileB[bucket])
      note(`${bucket}: A remove pliku B`, still && (data ?? []).length === 0, `${data?.length ?? 0} usuniętych, plik ${still ? 'jest' : 'zniknął'}`)
      expect(data ?? []).toHaveLength(0)
      expect(still).toBe(true)
    })

    test('A: update (upsert) pliku B -> błąd, treść bez zmian', async () => {
      const { error } = await A.client.storage.from(bucket).update(fileB[bucket], new Blob(['zmienione']))
      const { data } = await admin.storage.from(bucket).download(fileB[bucket])
      const content = data ? await data.text() : ''
      note(`${bucket}: A nadpisanie pliku B`, !!error && content === 'iso', error ? 'odmowa' : 'nadpisano')
      expect(error).not.toBeNull()
      expect(content).toBe('iso')
    })

    test('kontrola pozytywna: A wgrywa, widzi, pobiera, podpisuje i usuwa własny plik', async () => {
      const p = `${A.id}/${fileName()}`
      const up = await A.client.storage.from(bucket).upload(p, body(), { contentType: 'text/plain' })
      const list = await A.client.storage.from(bucket).list(A.id)
      const dl = await A.client.storage.from(bucket).download(p)
      const signed = await A.client.storage.from(bucket).createSignedUrl(p, 60)
      const rm = await A.client.storage.from(bucket).remove([p])
      const gone = !(await exists(bucket, p))
      const ok = !up.error && (list.data ?? []).some((f) => f.name === path.posix.basename(p)) && !dl.error && !!signed.data?.signedUrl && rm.data?.length === 1 && gone
      note(`${bucket}: A własny plik (upload/list/download/signed/remove)`, ok, ok ? 'działa' : 'nie działa')
      expect(up.error).toBeNull()
      expect((list.data ?? []).map((f) => f.name)).toContain(path.posix.basename(p))
      expect(dl.error).toBeNull()
      expect(signed.data?.signedUrl).toBeTruthy()
      expect(rm.data).toHaveLength(1)
      expect(gone).toBe(true)
    })

    test('anon: upload, list, download, signed URL, remove -> odmowa', async () => {
      const up = await anon.storage.from(bucket).upload(`${B.id}/${fileName()}`, body())
      const upRoot = await anon.storage.from(bucket).upload(fileName(), body())
      const list = await anon.storage.from(bucket).list(B.id)
      const dl = await anon.storage.from(bucket).download(fileB[bucket])
      const signed = await anon.storage.from(bucket).createSignedUrl(fileB[bucket], 60)
      const rm = await anon.storage.from(bucket).remove([fileB[bucket]])
      const still = await exists(bucket, fileB[bucket])
      const ok =
        !!up.error && !!upRoot.error && (list.data ?? []).length === 0 && !!dl.error && !!signed.error && (rm.data ?? []).length === 0 && still
      note(`${bucket}: anon upload/list/download/signed/remove`, ok, ok ? 'odmowa' : 'DOSTĘP')
      expect(up.error).not.toBeNull()
      expect(upRoot.error).not.toBeNull()
      expect(list.data ?? []).toHaveLength(0)
      expect(dl.error).not.toBeNull()
      expect(signed.error).not.toBeNull()
      expect(rm.data ?? []).toHaveLength(0)
      expect(still).toBe(true)
    })
  })
})

function writeReport() {
  const lines: string[] = [
    '# Macierz izolacji kont (krok 04, slice 6)',
    '',
    'Raport generuje test `__tests__/integration/isolation.test.ts` (nie edytować ręcznie). Dane: baza preview, dwie prawdziwe',
    'sesje testowe A i B (logowanie hasłem, klucz anon) oraz sesja anon; storage: buckety `invoices` i `manual-uploads`.',
    'Lista tabel jest wyliczana z bazy (OpenAPI PostgREST: kolumna `owner_id`); test-strażnik wywala się, gdy nowa tabela',
    'nie ma wpisu w macierzy. `OK` = zachowanie zgodne z izolacją, `PRZECIEK` = naruszenie. W nawiasie: wynik zapytania.',
    '',
    '## Tabele (A działa na danych B, anon bez sesji)',
    '',
    `| tabela | ${COLUMNS.map(([, l]) => l).join(' | ')} |`,
    `|---|${COLUMNS.map(() => '---').join('|')}|`,
  ]
  for (const [table, row] of [...cells.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| \`${table}\` | ${COLUMNS.map(([k]) => row[k] ?? '—').join(' | ')} |`)
  }
  lines.push('', '## Storage', '', '| próba | wynik |', '|---|---|')
  for (const c of storageCells.sort((a, b) => a.name.localeCompare(b.name))) lines.push(`| ${c.name} | ${c.result} |`)
  lines.push(
    '',
    '## Wyjątki',
    '',
    '- `google_credentials`: tylko service role, bez polityk RLS (`REVOKE ALL` dla authenticated i anon); w tabeli wyżej wszystkie próby (także na własnym wierszu A) kończą się odmową.',
    '- `google_connections`: authenticated tylko `SELECT` własnego wiersza (RLS), zapis wyłącznie rolą service, anon nic; próby zapisu na własnym wierszu A to odmowa (42501), nie kontrola pozytywna.',
    '- `legacy_owner`: tylko service role (`REVOKE ALL` dla authenticated i anon); wiersze `legacy_owner (…)` w tabeli wyżej to próby odczytu i zmian.',
    '- `system_settings`: tabela globalna (flagi środowiska), celowo bez `owner_id`; zamknięta dla authenticated i anon (`REVOKE ALL`).',
    '- `profiles`: klucz `id` = id konta (bez `owner_id`); dopisana do macierzy jawnie. Brak polityki INSERT/DELETE, więc te operacje są odrzucane.',
    '- `app_config` i `profiles` mają jeden wiersz na konto (zakłada go trigger `handle_new_user`), więc próby INSERT/DELETE własnego wiersza są pominięte (n/d).',
    '',
  )
  mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, lines.join('\n'))
}
