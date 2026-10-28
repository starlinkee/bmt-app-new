// Szyfrowanie sekretów Google per konto (AES-256-GCM, Node crypto). Czysty moduł bez zależności od Next.js,
// żeby importował go zarówno kod aplikacji (przez lib/secret-box.ts), jak i scripts/google-key-rotate.mjs.
//
// Klucze: zmienne env GOOGLE_TOKEN_KEY_V<n> (base64, dokładnie 32 bajty). Wersja bieżąca = NAJWYŻSZE n obecne w env
// (bez osobnej zmiennej CURRENT): rotacja = dodanie V<n+1> obok V<n>, uruchomienie skryptu przeszyfrowującego,
// usunięcie V<n>. AAD = owner_id, więc szyfrogram przeniesiony do wiersza innego konta się nie odszyfruje.
// Nigdy nie loguj plaintextu ani klucza - błędy niosą tylko numer wersji i nazwę zmiennej.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_VAR = /^GOOGLE_TOKEN_KEY_V(\d+)$/
const MAX_KEY_VERSION = 32767 // kolumna key_version to smallint

/** Brak klucza dla wersji (nie ustawiony w env). W aplikacji = konto wymaga ponownego połączenia (needs_reauth). */
export class SecretKeyMissingError extends Error {
  /** @param {number | null} keyVersion */
  constructor(keyVersion) {
    super(
      keyVersion === null
        ? 'Brak kluczy szyfrujących: ustaw GOOGLE_TOKEN_KEY_V<n> (base64, 32 bajty).'
        : `Brak klucza GOOGLE_TOKEN_KEY_V${keyVersion} w środowisku.`,
    )
    this.name = 'SecretKeyMissingError'
    this.keyVersion = keyVersion
  }
}

/** Klucz jest ustawiony, ale nie jest poprawnym base64 z dokładnie 32 bajtami. Komunikat nie zawiera wartości. */
export class SecretKeyInvalidError extends Error {
  /** @param {number} keyVersion */
  constructor(keyVersion) {
    super(`GOOGLE_TOKEN_KEY_V${keyVersion} jest nieprawidłowy: oczekiwano base64 z dokładnie ${KEY_BYTES} bajtami.`)
    this.name = 'SecretKeyInvalidError'
    this.keyVersion = keyVersion
  }
}

/** @typedef {{ ct: Buffer, iv: Buffer, keyVersion: number }} SealedSecret */
/** @typedef {Record<string, string | undefined>} KeyEnv */

/** Numery wersji kluczy obecnych w env, rosnąco. */
/** @param {KeyEnv} [env] */
export function availableKeyVersions(env = process.env) {
  const versions = []
  for (const name of Object.keys(env)) {
    const m = KEY_VAR.exec(name)
    if (!m || !env[name]) continue
    const n = Number(m[1])
    if (Number.isSafeInteger(n) && n >= 1 && n <= MAX_KEY_VERSION) versions.push(n)
  }
  return versions.sort((a, b) => a - b)
}

/** Bieżąca wersja klucza = najwyższe n w env. */
/** @param {KeyEnv} [env] */
export function currentKeyVersion(env = process.env) {
  const versions = availableKeyVersions(env)
  if (versions.length === 0) throw new SecretKeyMissingError(null)
  return versions[versions.length - 1]
}

/** @param {number} version @param {KeyEnv} env */
function keyFor(version, env) {
  const raw = env[`GOOGLE_TOKEN_KEY_V${version}`]
  if (!raw) throw new SecretKeyMissingError(version)
  // Buffer.from(…, 'base64') nie rzuca na śmieciach, więc sprawdzamy kształt i długość po dekodowaniu.
  const key = /^[A-Za-z0-9+/]+={0,2}$/.test(raw.trim()) ? Buffer.from(raw.trim(), 'base64') : null
  if (!key || key.length !== KEY_BYTES) throw new SecretKeyInvalidError(version)
  return key
}

/**
 * Szyfruje plaintext kluczem bieżącej wersji. ct = szyfrogram + tag GCM (16 B), iv = 12 losowych bajtów.
 * @param {string} plaintext
 * @param {string} ownerId
 * @param {KeyEnv} [env]
 * @returns {SealedSecret}
 */
export function encryptSecret(plaintext, ownerId, env = process.env) {
  const keyVersion = currentKeyVersion(env)
  const key = keyFor(keyVersion, env)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(Buffer.from(ownerId, 'utf8'))
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { ct, iv, keyVersion }
}

/**
 * Odszyfrowuje; zmanipulowany ct/iv/tag albo inny ownerId rzuca (błąd uwierzytelnienia GCM).
 * @param {SealedSecret} sealed
 * @param {string} ownerId
 * @param {KeyEnv} [env]
 * @returns {string}
 */
export function decryptSecret(sealed, ownerId, env = process.env) {
  const { ct, iv, keyVersion } = sealed
  const key = keyFor(keyVersion, env)
  if (iv.length !== IV_BYTES) throw new Error('Nieprawidłowa długość IV.')
  if (ct.length < TAG_BYTES) throw new Error('Szyfrogram jest krótszy niż tag uwierzytelniający.')
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  decipher.setAAD(Buffer.from(ownerId, 'utf8'))
  decipher.setAuthTag(ct.subarray(ct.length - TAG_BYTES))
  return Buffer.concat([decipher.update(ct.subarray(0, ct.length - TAG_BYTES)), decipher.final()]).toString('utf8')
}

/**
 * Czy wiersz jest zaszyfrowany starszym kluczem niż bieżący.
 * @param {SealedSecret} sealed
 * @param {KeyEnv} [env]
 */
export function needsRotation(sealed, env = process.env) {
  return sealed.keyVersion < currentKeyVersion(env)
}

/**
 * Odszyfrowuje kluczem wiersza i szyfruje kluczem bieżącym (ten sam ownerId jako AAD).
 * @param {SealedSecret} sealed
 * @param {string} ownerId
 * @param {KeyEnv} [env]
 */
export function reencrypt(sealed, ownerId, env = process.env) {
  return encryptSecret(decryptSecret(sealed, ownerId, env), ownerId, env)
}

// PostgREST zwraca i przyjmuje bytea jako tekst hex z prefiksem "\x".
/** @param {Buffer} buf */
export function toPgBytea(buf) {
  return `\\x${buf.toString('hex')}`
}

/** @param {string} value */
export function fromPgBytea(value) {
  if (typeof value !== 'string' || !/^\\x([0-9a-f]{2})*$/i.test(value)) throw new Error('Nieprawidłowa wartość bytea.')
  return Buffer.from(value.slice(2), 'hex')
}
