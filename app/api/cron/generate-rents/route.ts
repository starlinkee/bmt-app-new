import { NextResponse } from 'next/server'
import { generateRents } from '@/lib/rents'

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
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const results = await generateRents(month, year)
    
    return NextResponse.json({ 
      success: true, 
      generated: results.length,
      month,
      year 
    })
  } catch (error: any) {
    console.error('Error generating rents via cron:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
