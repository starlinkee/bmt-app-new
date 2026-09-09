import { NextResponse } from 'next/server'
import { processStatementUploadReminder } from '@/lib/statement-reminder'

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const vercelCron = request.headers.get('x-vercel-cron')

  if (vercelCron !== '1') {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await processStatementUploadReminder()
    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    console.error('Error sending statement upload reminder via cron:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
