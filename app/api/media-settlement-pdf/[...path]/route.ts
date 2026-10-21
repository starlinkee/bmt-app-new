import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { isOwnedPath } from '@/lib/storage-paths'

// Pliki PDF z automatycznego rozliczenia mediów (bucket 'invoices', patrz
// media/actions.ts -> uploadToSupabaseStorage) leżą w prywatnym buckecie,
// więc do podglądu z "Historii mediów" trzeba wygenerować podpisany URL
// na żądanie - dokładnie tak samo jak dla załączników maili
// (app/api/attachments/[filename]/route.ts).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await requireAuth()

  const { path } = await params
  const storagePath = path.join('/')
  if (!storagePath || storagePath.includes('..')) {
    return new NextResponse('Invalid path', { status: 400 })
  }

  // Klucz service omija polityki storage, więc właściciela sprawdzamy tu jawnie. 404 (nie 403),
  // żeby nie zdradzać, że cudzy plik istnieje.
  if (!isOwnedPath(user.id, storagePath)) {
    return new NextResponse('File not found', { status: 404 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUrl(storagePath, 60)

  if (error || !data) {
    return new NextResponse('File not found', { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
