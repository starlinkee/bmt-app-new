import 'server-only'

// Szyfrowanie refresh tokenów Google per konto (AES-256-GCM, AAD = owner_id). Implementacja w
// lib/secret-box-core.mjs, bo korzysta z niej też scripts/google-key-rotate.mjs; opis kluczy i rotacji tam.
export {
  SecretKeyInvalidError,
  SecretKeyMissingError,
  availableKeyVersions,
  currentKeyVersion,
  decryptSecret,
  encryptSecret,
  fromPgBytea,
  needsRotation,
  reencrypt,
  toPgBytea,
  type SealedSecret,
} from './secret-box-core.mjs'
