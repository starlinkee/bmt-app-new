import { NextResponse } from 'next/server'
import { processLateReminders } from '@/lib/late-reminders'

export const maxDuration = 300 // allow up to 5 minutes

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const vercelCron = request.headers.get('x-vercel-cron')
  
  if (vercelCron !== '1') {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await processLateReminders()
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Error generating late reminders via cron:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
