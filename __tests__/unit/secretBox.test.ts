import { afterEach, describe, expect, test, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  SecretKeyInvalidError,
  SecretKeyMissingError,
  currentKeyVersion,
  decryptSecret,
  encryptSecret,
  fromPgBytea,
  needsRotation,
  reencrypt,
  toPgBytea,
} from '../../lib/secret-box'
import { rotateAll } from '../../scripts/google-key-rotate.mjs'

const OWNER_A = '11111111-1111-4111-8111-111111111111'
const OWNER_B = '22222222-2222-4222-8222-222222222222'
const TOKEN = '1//refresh-token-testowy'
const key = () => randomBytes(32).toString('base64')
const envWith = (...versions: number[]) => Object.fromEntries(versions.map((n) => [`GOOGLE_TOKEN_KEY_V${n}`, key()]))

afterEach(() => vi.restoreAllMocks())

describe('lib/secret-box', () => {
  test('round-trip: odszyfrowanie zwraca plaintext, ct = szyfrogram + tag 16 B, iv 12 B', () => {
    const env = envWith(1)
    const sealed = encryptSecret(TOKEN, OWNER_A, env)
    expect(sealed.keyVersion).toBe(1)
    expect(sealed.iv).toHaveLength(12)
    expect(sealed.ct).toHaveLength(Buffer.byteLength(TOKEN) + 16)
    expect(sealed.ct.toString('utf8')).not.toContain(TOKEN)
    expect(decryptSecret(sealed, OWNER_A, env)).toBe(TOKEN)
  })

  test('dwa szyfrowania tego samego tekstu: różny IV i różny szyfrogram', () => {
    const env = envWith(1)
    const a = encryptSecret(TOKEN, OWNER_A, env)
    const b = encryptSecret(TOKEN, OWNER_A, env)
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.ct.equals(b.ct)).toBe(false)
  })

  test('zmieniony bajt szyfrogramu, tagu albo iv -> rzuca', () => {
    const env = envWith(1)
    const sealed = encryptSecret(TOKEN, OWNER_A, env)
    const flip = (buf: Buffer, i: number) => {
      const c = Buffer.from(buf)
      c[i] ^= 0x01
      return c
    }
    expect(() => decryptSecret({ ...sealed, ct: flip(sealed.ct, 0) }, OWNER_A, env)).toThrow()
    expect(() => decryptSecret({ ...sealed, ct: flip(sealed.ct, sealed.ct.length - 1) }, OWNER_A, env)).toThrow()
    expect(() => decryptSecret({ ...sealed, iv: flip(sealed.iv, 0) }, OWNER_A, env)).toThrow()
    expect(() => decryptSecret({ ...sealed, ct: sealed.ct.subarray(0, 8) }, OWNER_A, env)).toThrow()
    expect(() => decryptSecret({ ...sealed, iv: sealed.iv.subarray(0, 8) }, OWNER_A, env)).toThrow()
  })

  test('inny ownerId (AAD) -> rzuca', () => {
    const env = envWith(1)
    const sealed = encryptSecret(TOKEN, OWNER_A, env)
    expect(() => decryptSecret(sealed, OWNER_B, env)).toThrow()
  })

  test('brak klucza dla wersji wiersza -> SecretKeyMissingError z numerem wersji', () => {
    const sealed = encryptSecret(TOKEN, OWNER_A, envWith(1))
    expect(() => decryptSecret(sealed, OWNER_A, envWith(2))).toThrow(SecretKeyMissingError)
    try {
      decryptSecret(sealed, OWNER_A, envWith(2))
    } catch (e) {
      expect((e as SecretKeyMissingError).keyVersion).toBe(1)
    }
    expect(() => encryptSecret(TOKEN, OWNER_A, {})).toThrow(SecretKeyMissingError)
  })

  test('zły rozmiar lub format klucza -> SecretKeyInvalidError bez wartości klucza w komunikacie', () => {
    const secret = randomBytes(16).toString('base64')
    for (const bad of [secret, 'to nie jest base64!!', randomBytes(33).toString('base64')]) {
      const env = { GOOGLE_TOKEN_KEY_V1: bad }
      expect(() => encryptSecret(TOKEN, OWNER_A, env)).toThrow(SecretKeyInvalidError)
      try {
        encryptSecret(TOKEN, OWNER_A, env)
      } catch (e) {
        expect((e as Error).message).not.toContain(bad)
      }
    }
  })

  test('bieżąca wersja to najwyższe n w env; nieznane nazwy zmiennych są ignorowane', () => {
    expect(currentKeyVersion({ ...envWith(1, 3, 2), GOOGLE_TOKEN_KEY_V0: key(), GOOGLE_TOKEN_KEY_VX: key(), GOOGLE_TOKEN_KEY_V4_OLD: key() })).toBe(3)
  })

  test('rotacja V1 -> V2: szyfrogram ma keyVersion 2 i odszyfrowuje się kluczem V2 (bez V1)', () => {
    const v1 = envWith(1)
    const both = { ...v1, ...envWith(2) }
    const old = encryptSecret(TOKEN, OWNER_A, v1)
    expect(needsRotation(old, v1)).toBe(false)
    expect(needsRotation(old, both)).toBe(true)

    const next = reencrypt(old, OWNER_A, both)
    expect(next.keyVersion).toBe(2)
    expect(needsRotation(next, both)).toBe(false)
    expect(decryptSecret(next, OWNER_A, envWith2Only(both))).toBe(TOKEN)
    // Przeszyfrowanie nie pozwala zmienić konta.
    expect(() => reencrypt(old, OWNER_B, both)).toThrow()
  })

  test('bytea PostgREST: toPgBytea/fromPgBytea round-trip i odrzucenie śmieci', () => {
    const buf = randomBytes(40)
    expect(fromPgBytea(toPgBytea(buf)).equals(buf)).toBe(true)
    expect(() => fromPgBytea('abc')).toThrow()
    expect(() => fromPgBytea('\\xzz')).toThrow()
  })

  test('nie loguje plaintextu ani klucza', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const env = envWith(1)
    decryptSecret(encryptSecret(TOKEN, OWNER_A, env), OWNER_A, env)
    expect(spies.every((s) => s.mock.calls.length === 0)).toBe(true)
  })
})

function envWith2Only(env: Record<string, string>) {
  return { GOOGLE_TOKEN_KEY_V2: env.GOOGLE_TOKEN_KEY_V2 }
}

describe('scripts/google-key-rotate', () => {
  type Row = { owner_id: string; refresh_token_ct: string; iv: string; key_version: number }
  const seal = (owner: string, env: Record<string, string>): Row => {
    const s = encryptSecret(`token-${owner}`, owner, env)
    return { owner_id: owner, refresh_token_ct: toPgBytea(s.ct), iv: toPgBytea(s.iv), key_version: s.keyVersion }
  }
  const memoryStore = (rows: Row[]) => ({
    writes: 0,
    rows,
    async list() {
      return this.rows.map((r) => ({ ...r }))
    },
    async update(row: Row, next: { ct: Buffer; iv: Buffer; keyVersion: number }) {
      this.writes++
      const target = this.rows.find((r) => r.owner_id === row.owner_id && r.key_version === row.key_version)
      if (!target) return { error: { message: 'brak' } }
      Object.assign(target, { refresh_token_ct: toPgBytea(next.ct), iv: toPgBytea(next.iv), key_version: next.keyVersion })
      return { error: null }
    },
  })

  test('dry-run: raportuje liczby i niczego nie zapisuje', async () => {
    const v1 = envWith(1)
    const env = { ...v1, ...envWith(2) }
    const store = memoryStore([seal(OWNER_A, v1), seal(OWNER_B, env)])
    const before = JSON.stringify(store.rows)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await rotateAll(store, { apply: false, env })).toEqual({ total: 2, toRotate: 1, rotated: 0, errors: 0 })
    expect(store.writes).toBe(0)
    expect(JSON.stringify(store.rows)).toBe(before)
  })

  test('apply: przeszyfrowuje tylko starsze wiersze, jest idempotentny, token się zgadza', async () => {
    const v1 = envWith(1)
    const env = { ...v1, ...envWith(2) }
    const store = memoryStore([seal(OWNER_A, v1), seal(OWNER_B, env)])
    expect(await rotateAll(store, { apply: true, env })).toEqual({ total: 2, toRotate: 1, rotated: 1, errors: 0 })
    expect(store.rows.map((r) => r.key_version)).toEqual([2, 2])
    expect(await rotateAll(store, { apply: true, env })).toEqual({ total: 2, toRotate: 0, rotated: 0, errors: 0 })
    expect(store.writes).toBe(1)
    const row = store.rows[0]
    const opened = decryptSecret({ ct: fromPgBytea(row.refresh_token_ct), iv: fromPgBytea(row.iv), keyVersion: row.key_version }, OWNER_A, envWith2Only(env))
    expect(opened).toBe(`token-${OWNER_A}`)
  })

  test('brak klucza starej wersji: błąd liczony per wiersz, raport bez sekretów, reszta przeszyfrowana', async () => {
    const v1 = envWith(1)
    const v2 = envWith(2)
    const store = memoryStore([seal(OWNER_A, v1), seal(OWNER_B, v2)])
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    // W env tylko V2: wiersz V1 nie odszyfruje się, wiersz V2 jest aktualny.
    const stats = await rotateAll(store, { apply: true, env: { ...v2, ...envWith(3) } })
    expect(stats).toEqual({ total: 2, toRotate: 2, rotated: 1, errors: 1 })
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/token-|GOOGLE_TOKEN_KEY|\\x/)
  })
})
