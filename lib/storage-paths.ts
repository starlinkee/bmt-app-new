// Ścieżki w Supabase Storage (buckety 'invoices' i 'manual-uploads') są per konto: pierwszy segment
// to owner_id (uuid z auth.users). Na tym opierają się polityki storage ((storage.foldername(name))[1] =
// auth.uid()) oraz sprawdzenie właściciela w trasach, które podpisują URL kluczem service role.

/** Dokleja prefiks konta do ścieżki względnej. */
export function ownerPath(ownerId: string, rel: string): string {
  return `${ownerId}/${rel.replace(/^\/+/, '')}`
}

/** Czy ścieżka leży pod prefiksem konta (bez `..`, bez pustych segmentów, bez bezwzględnych ścieżek). */
export function isOwnedPath(ownerId: string, path: string): boolean {
  if (!ownerId || !path.startsWith(`${ownerId}/`)) return false
  const segments = path.split('/')
  return segments.length > 1 && segments.every((s) => s !== '' && s !== '.' && s !== '..')
}

/**
 * Ścieżka załącznika e-maila. W `email_logs.attachments[].path` jest sama nazwa `<uuid>_<plik>`;
 * pełną ścieżkę składa ten helper - dla zapisu (lib/email.ts) i odczytu (trasa attachments), więc
 * oba końce zawsze się zgadzają także na preview (tam z dodatkowym `preview/`).
 */
export function emailAttachmentPath(ownerId: string, name: string, isPreview: boolean): string {
  return ownerPath(ownerId, `${isPreview ? 'preview/' : ''}emails/${name}`)
}

export function isPreviewEnv(): boolean {
  return process.env.VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
}
