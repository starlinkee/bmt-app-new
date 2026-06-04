import { NextRequest, NextResponse } from 'next/server'
import { getVpsUrl, invalidatePortCache, vpsHeaders } from '@/lib/skill-runner-client'

function isValidSkillId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && id.length <= 60
}

export async function GET(req: NextRequest) {
  const skillId = req.nextUrl.searchParams.get('skillId')
  if (!isValidSkillId(skillId)) {
    return NextResponse.json({ error: 'Invalid skillId' }, { status: 400 })
  }

  const vpsUrl = await getVpsUrl()
  if (!vpsUrl) {
    return NextResponse.json({ error: 'Skill runner not configured or unreachable' }, { status: 503 })
  }

  try {
    const res = await fetch(`${vpsUrl}/skill/${skillId}/prompt`, {
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

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const { skillId, content, label, description, timeoutMs } = body

  if (!isValidSkillId(skillId)) {
    return NextResponse.json({ error: 'Invalid skillId' }, { status: 400 })
  }
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
  }

  const vpsUrl = await getVpsUrl()
  if (!vpsUrl) {
    return NextResponse.json({ error: 'Skill runner not configured or unreachable' }, { status: 503 })
  }

  try {
    const res = await fetch(`${vpsUrl}/skill/${skillId}/prompt`, {
      method: 'PUT',
      headers: vpsHeaders(),
      body: JSON.stringify({ content, label, description, timeoutMs }),
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

export async function DELETE(req: NextRequest) {
  const skillId = req.nextUrl.searchParams.get('skillId')
  if (!isValidSkillId(skillId)) {
    return NextResponse.json({ error: 'Invalid skillId' }, { status: 400 })
  }

  const vpsUrl = await getVpsUrl()
  if (!vpsUrl) {
    return NextResponse.json({ error: 'Skill runner not configured or unreachable' }, { status: 503 })
  }

  try {
    const res = await fetch(`${vpsUrl}/skill/${skillId}`, {
      method: 'DELETE',
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
