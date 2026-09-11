import { NextResponse } from 'next/server'
import { generateRents } from '@/lib/rents'
import { getCurrentDate } from '@/lib/clock'

export const maxDuration = 300 // allow up to 5 minutes

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const vercelCron = request.headers.get('x-vercel-cron')
  
  const isOverrideAllowed = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ALLOW_TEST_PANEL === 'true'

  if (vercelCron !== '1' && !isOverrideAllowed) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const { searchParams } = new URL(request.url)
    const queryMonth = searchParams.get('month')
    const queryYear = searchParams.get('year')

    const now = await getCurrentDate()
    let month = now.getMonth() + 1
    let year = now.getFullYear()

    if (isOverrideAllowed && queryMonth && queryYear) {
      month = parseInt(queryMonth, 10)
      year = parseInt(queryYear, 10)
    }

    // Źródło generacji: prawdziwy Vercel Cron -> CRON, wywołanie ręczne z
    // sekretem CRON_SECRET (np. curl na produkcji) -> MANUAL, wywołanie z
    // panelu testowego (dev/preview lub NEXT_PUBLIC_ALLOW_TEST_PANEL) -> TEST_MANUAL.
    const source = vercelCron === '1' ? 'CRON' : isOverrideAllowed ? 'TEST_MANUAL' : 'MANUAL'

    const results = await generateRents(month, year, source)

    return NextResponse.json({
      success: true,
      generated: results.length,
      month,
      year,
      source,
      simulated: isOverrideAllowed && (!!queryMonth || !!queryYear)
    })
  } catch (error: unknown) {
    console.error('Error generating rents via cron:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
