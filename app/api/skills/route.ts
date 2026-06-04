import { NextResponse } from 'next/server'
import { getVpsUrl, invalidatePortCache, vpsHeaders } from '@/lib/skill-runner-client'

export async function GET() {
  const vpsUrl = await getVpsUrl()
  if (!vpsUrl) {
    return NextResponse.json({ error: 'Skill runner not configured or unreachable' }, { status: 503 })
  }

  try {
    const res = await fetch(`${vpsUrl}/skills`, {
      headers: vpsHeaders(),
      signal: AbortSignal.timeout(5_000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    invalidatePortCache()
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not reach skill runner: ${message}` }, { status: 502 })
  }
}
