import { NextRequest, NextResponse } from 'next/server'
import { getVpsUrl, invalidatePortCache, vpsHeaders } from '@/lib/skill-runner-client'

function isValidSkillId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && id.length <= 60
}

export async function POST(req: NextRequest) {
  const vpsUrl = await getVpsUrl()
  if (!vpsUrl) {
    return NextResponse.json(
      { error: 'Skill runner not configured or unreachable (SKILL_RUNNER_URL missing or no open port)' },
      { status: 503 }
    )
  }

  const body = await req.json().catch(() => ({})) as { skill?: string }
  const skill = body.skill

  if (!isValidSkillId(skill)) {
    return NextResponse.json({ error: `Invalid skill id: ${skill}` }, { status: 400 })
  }

  try {
    const res = await fetch(`${vpsUrl}/run-skill`, {
      method: 'POST',
      headers: vpsHeaders(),
      body: JSON.stringify({ skill }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    invalidatePortCache()
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not reach skill runner: ${message}` }, { status: 502 })
  }
}

export async function DELETE(req: NextRequest) {
  const vpsUrl = await getVpsUrl()
  if (!vpsUrl) return NextResponse.json({ error: 'Skill runner not configured or unreachable' }, { status: 503 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  try {
    const res = await fetch(`${vpsUrl}/job/${jobId}/cancel`, {
      method: 'POST',
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

export async function GET(req: NextRequest) {
  const vpsUrl = await getVpsUrl()
  if (!vpsUrl) {
    return NextResponse.json({ error: 'Skill runner not configured or unreachable' }, { status: 503 })
  }

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  try {
    const res = await fetch(`${vpsUrl}/job/${jobId}`, {
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
