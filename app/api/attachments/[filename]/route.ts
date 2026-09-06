
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  await requireAuth()

  const { filename } = await params
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new NextResponse('Invalid filename', { status: 400 })
  }

  const supabase = createServiceClient()
  
  // Try finding it in 'emails/' folder
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUrl(`emails/${filename}`, 60, { download: true })

  if (error || !data) {
    return new NextResponse('File not found', { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
