/**
 * Minimalny in-memory odpowiednik supabase-js query buildera na potrzeby testów
 * jednostkowych. W odróżnieniu od `chain()` z contracts.actions.test.ts
 * faktycznie stosuje filtry (eq/in/not), unikalne klucze i zapisy, więc można
 * testować logikę liczącą po danych (saldo, wyciąg, czynsze, dedup przypomnień)
 * bez łączenia się z bazą.
 *
 * Nie jest pełną implementacją PostgREST - obsługuje tylko to, czego używa kod
 * w lib/. Brakującą metodę dopisujemy tutaj, zamiast mockować ją w teście.
 */

export type Row = Record<string, unknown>
type Result = { data: unknown; error: { code?: string; message: string } | null }

export interface FakeSupabaseOptions {
  /** Klucze unikalne per tabela - naruszenie zwraca błąd 23505 jak Postgres. */
  unique?: Record<string, string[]>
}

export interface FakeSupabase {
  from: (table: string) => Builder
  tables: Record<string, Row[]>
}

type Filter = (row: Row) => boolean

class Builder implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filters: Filter[] = []
  private payload: Row | Row[] | null = null
  private ignoreDuplicates = false
  private orders: { col: string; asc: boolean }[] = []
  private wantSingle = false
  private nextId: () => number

  constructor(
    private table: string,
    private db: FakeSupabase,
    private options: FakeSupabaseOptions,
  ) {
    this.nextId = () => {
      const ids = (db.tables[table] ?? []).map((r) => Number(r.id)).filter(Number.isFinite)
      return ids.length ? Math.max(...ids) + 1 : 1
    }
  }

  select(_cols?: string) {
    void _cols
    return this
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert'
    this.payload = payload
    return this
  }
  upsert(payload: Row | Row[], opts?: { ignoreDuplicates?: boolean }) {
    this.op = 'upsert'
    this.payload = payload
    this.ignoreDuplicates = !!opts?.ignoreDuplicates
    return this
  }
  update(payload: Row) {
    this.op = 'update'
    this.payload = payload
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val)
    return this
  }
  in(col: string, vals: readonly unknown[]) {
    this.filters.push((r) => vals.includes(r[col]))
    return this
  }
  not(col: string, operator: string, val: unknown) {
    if (operator === 'is') {
      this.filters.push((r) => (val === null ? r[col] != null : r[col] !== val))
    } else if (operator === 'in') {
      const list = String(val).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim())
      this.filters.push((r) => !list.includes(String(r[col])))
    } else {
      throw new Error(`fakeSupabase: not(${operator}) nie jest obsługiwane`)
    }
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false })
    return this
  }
  single() {
    this.wantSingle = true
    return this
  }

  private matches(row: Row) {
    return this.filters.every((f) => f(row))
  }

  private violatesUnique(rows: Row[], candidate: Row, ignore?: Row) {
    const keys = this.options.unique?.[this.table]
    if (!keys) return false
    return rows.some((r) => r !== ignore && keys.every((k) => r[k] === candidate[k]))
  }

  private run(): Result {
    const rows = (this.db.tables[this.table] ??= [])

    if (this.op === 'insert' || this.op === 'upsert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      const inserted: Row[] = []
      for (const item of incoming) {
        if (this.violatesUnique(rows, item)) {
          if (this.op === 'upsert' && this.ignoreDuplicates) continue
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        }
        const row = { id: this.nextId(), ...item }
        rows.push(row)
        inserted.push(row)
      }
      return this.wrap(inserted)
    }

    if (this.op === 'update') {
      const updated = rows.filter((r) => this.matches(r))
      updated.forEach((r) => Object.assign(r, this.payload))
      return this.wrap(updated)
    }

    if (this.op === 'delete') {
      const removed = rows.filter((r) => this.matches(r))
      this.db.tables[this.table] = rows.filter((r) => !this.matches(r))
      return this.wrap(removed)
    }

    let result = rows.filter((r) => this.matches(r)).map((r) => ({ ...r }))
    for (const { col, asc } of [...this.orders].reverse()) {
      result = result.sort((a, b) => {
        const av = a[col] as number | string
        const bv = b[col] as number | string
        if (av === bv) return 0
        return (av > bv ? 1 : -1) * (asc ? 1 : -1)
      })
    }
    return this.wrap(result)
  }

  private wrap(rows: Row[]): Result {
    if (this.wantSingle) {
      return rows.length
        ? { data: rows[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    }
    return { data: rows, error: null }
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}

export function createFakeSupabase(
  initial: Record<string, Row[]> = {},
  options: FakeSupabaseOptions = {},
): FakeSupabase {
  const db: FakeSupabase = {
    tables: Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
    from: (table: string) => new Builder(table, db, options),
  }
  return db
}
