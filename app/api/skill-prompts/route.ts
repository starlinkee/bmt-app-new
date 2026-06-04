import { NextRequest, NextResponse } from 'next/server'
import { getVpsUrl, invalidatePortCache, vpsHeaders } from '@/lib/skill-runner-client'

const ALLOWED_SKILLS = ['media-lubostron', 'kurs-walut'] as const
type AllowedSkill = (typeof ALLOWED_SKILLS)[number]

export async function GET(req: NextRequest) {
  const skillId = req.nextUrl.searchParams.get('skillId')
  if (!skillId || !ALLOWED_SKILLS.includes(skillId as AllowedSkill)) {
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
  const body = await req.json().catch(() => ({})) as { skillId?: string; content?: string }
  const { skillId, content } = body

  if (!skillId || !ALLOWED_SKILLS.includes(skillId as AllowedSkill)) {
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
      body: JSON.stringify({ content }),
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
