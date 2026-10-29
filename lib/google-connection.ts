import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { SecretKeyInvalidError, SecretKeyMissingError, decryptSecret, encryptSecret, fromPgBytea, toPgBytea } from '@/lib/secret-box'
import { GoogleOAuthError, refreshAccessToken, revokeToken } from '@/lib/google-oauth'

// Połączenie konta z Google: zapis, odczyt tokenu dostępu i odłączenie. Klient service z jawnym owner_id
// (tabele google_* są dla ról użytkowników zamknięte albo tylko do odczytu). Użyje tego wysyłka maili w 7c.

/** Konto nie ma połączenia (brak wiersza google_credentials). */
export class GoogleNotConnectedError extends Error {
  constructor() {
    super('Konto nie ma połączenia z Google.')
    this.name = 'GoogleNotConnectedError'
  }
}

/** Połączenie przestało działać (unieważniona zgoda, utracony klucz): status needs_reauth, użytkownik łączy od nowa. */
export class GoogleReauthRequiredError extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`Wymagane ponowne połączenie z Google (${reason}).`)
    this.name = 'GoogleReauthRequiredError'
    this.reason = reason
  }
}

export async function saveConnection(ownerId: string, tokens: { refreshToken: string; scopes: string[] }, email: string) {
  const supabase = createServiceClient()
  const sealed = encryptSecret(tokens.refreshToken, ownerId)
  const now = new Date().toISOString()

  const { error: credError } = await supabase.from('google_credentials').upsert(
    {
      owner_id: ownerId,
      refresh_token_ct: toPgBytea(sealed.ct),
      iv: toPgBytea(sealed.iv),
      key_version: sealed.keyVersion,
      rotated_at: null,
    },
    { onConflict: 'owner_id' },
  )
  if (credError) throw new Error(`google_credentials: ${credError.code ?? 'błąd zapisu'}`)

  // Kolumny spoza upsertu (template_file_id, folder_id) zostają bez zmian przy ponownym połączeniu.
  const { error: connError } = await supabase.from('google_connections').upsert(
    {
      owner_id: ownerId,
      google_email: email,
      scopes: tokens.scopes,
      status: 'connected',
      connected_at: now,
      last_error: null,
      updated_at: now,
    },
    { onConflict: 'owner_id' },
  )
  if (connError) throw new Error(`google_connections: ${connError.code ?? 'błąd zapisu'}`)
}

export async function markNeedsReauth(ownerId: string, reason: string) {
  await createServiceClient()
    .from('google_connections')
    .update({ status: 'needs_reauth', last_error: reason, updated_at: new Date().toISOString() })
    .eq('owner_id', ownerId)
}

async function readCredentialRow(ownerId: string) {
  const { data, error } = await createServiceClient()
    .from('google_credentials')
    .select('refresh_token_ct, iv, key_version')
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) throw new Error(`google_credentials: ${error.code ?? 'błąd odczytu'}`)
  if (!data) throw new GoogleNotConnectedError()
  return data
}

function openRefreshToken(ownerId: string, row: Awaited<ReturnType<typeof readCredentialRow>>): string {
  return decryptSecret({ ct: fromPgBytea(row.refresh_token_ct), iv: fromPgBytea(row.iv), keyVersion: row.key_version }, ownerId)
}

/** Świeży access token konta. invalid_grant / brak lub zły klucz -> status needs_reauth i GoogleReauthRequiredError. */
export async function getAccessToken(ownerId: string): Promise<string> {
  const row = await readCredentialRow(ownerId)
  let refreshToken: string
  try {
    refreshToken = openRefreshToken(ownerId, row)
  } catch (e) {
    // Utracony klucz albo szyfrogram nie do odczytania (zmanipulowany, cudzy owner): pomaga tylko ponowne połączenie.
    const reason = e instanceof SecretKeyMissingError || e instanceof SecretKeyInvalidError ? 'key_unavailable' : 'decrypt_failed'
    await markNeedsReauth(ownerId, reason)
    throw new GoogleReauthRequiredError(reason)
  }

  try {
    const { accessToken } = await refreshAccessToken(refreshToken)
    const now = new Date().toISOString()
    await createServiceClient().from('google_connections').update({ last_ok_at: now, last_error: null, updated_at: now }).eq('owner_id', ownerId)
    return accessToken
  } catch (e) {
    if (e instanceof GoogleOAuthError && e.code === 'invalid_grant') {
      await markNeedsReauth(ownerId, 'invalid_grant')
      throw new GoogleReauthRequiredError('invalid_grant')
    }
    throw e
  }
}

/**
 * Odłączenie: revoke best effort (błąd lub brak klucza nie blokuje), usunięcie sekretu, status disconnected.
 * Zwraca, czy Google potwierdziło unieważnienie tokenu.
 */
export async function disconnect(ownerId: string): Promise<{ revoked: boolean }> {
  const supabase = createServiceClient()
  let revoked = false
  try {
    revoked = await revokeToken(openRefreshToken(ownerId, await readCredentialRow(ownerId)))
  } catch {
    // Brak wiersza, utracony klucz albo błąd sieci: sekret i tak kasujemy.
  }

  const { error: delError } = await supabase.from('google_credentials').delete().eq('owner_id', ownerId)
  if (delError) throw new Error(`google_credentials: ${delError.code ?? 'błąd usuwania'}`)

  const { error } = await supabase
    .from('google_connections')
    .update({ status: 'disconnected', last_error: null, updated_at: new Date().toISOString() })
    .eq('owner_id', ownerId)
  if (error) throw new Error(`google_connections: ${error.code ?? 'błąd zapisu'}`)
  return { revoked }
}
