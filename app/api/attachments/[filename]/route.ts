import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { requireAuth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  await requireAuth()

  const { filename } = await params
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new NextResponse('Invalid filename', { status: 400 })
  }

  const filePath = path.join(process.cwd(), 'data', 'attachments', filename)

  try {
    const file = await fs.readFile(filePath)
    
    // Determine content type (defaulting to pdf since mostly we send pdfs)
    let contentType = 'application/octet-stream'
    if (filename.toLowerCase().endsWith('.pdf')) {
      contentType = 'application/pdf'
    }

    const originalName = filename.split('_').slice(1).join('_') || filename

    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(originalName)}"`,
      },
    })
  } catch {
    return new NextResponse('File not found', { status: 404 })
  }
}
