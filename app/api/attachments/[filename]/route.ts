
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { emailAttachmentPath, isPreviewEnv } from '@/lib/storage-paths'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const user = await requireAuth()

  const { filename } = await params
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new NextResponse('Invalid filename', { status: 400 })
  }

  const supabase = createServiceClient()
  
  const searchParams = request.nextUrl.searchParams
  const shouldDownload = searchParams.get('download') === '1'
  
  // Ścieżka składana z id zalogowanego konta tym samym helperem co zapis (lib/email.ts):
  // cudzy plik nie istnieje pod prefiksem tego konta -> 404.
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUrl(emailAttachmentPath(user.id, filename, isPreviewEnv()), 60, { download: shouldDownload })

  if (error || !data) {
    return new NextResponse('File not found', { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
