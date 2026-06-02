import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_SKILLS = ['media-lubostron'] as const
type AllowedSkill = (typeof ALLOWED_SKILLS)[number]

function vpsHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-token': process.env.SKILL_RUNNER_TOKEN ?? '',
  }
}

function getVpsUrl() {
  return process.env.SKILL_RUNNER_URL
}

export async function POST(req: NextRequest) {
  const vpsUrl = getVpsUrl()
  if (!vpsUrl) {
    return NextResponse.json({ error: 'Skill runner not configured (SKILL_RUNNER_URL missing)' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({})) as { skill?: string }
  const skill = body.skill

  if (!skill || !ALLOWED_SKILLS.includes(skill as AllowedSkill)) {
    return NextResponse.json({ error: `Skill not allowed: ${skill}` }, { status: 400 })
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
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not reach skill runner: ${message}` }, { status: 502 })
  }
}

export async function DELETE(req: NextRequest) {
  const vpsUrl = getVpsUrl()
  if (!vpsUrl) return NextResponse.json({ error: 'Skill runner not configured' }, { status: 503 })

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
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not reach skill runner: ${message}` }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  const vpsUrl = getVpsUrl()
  if (!vpsUrl) {
    return NextResponse.json({ error: 'Skill runner not configured' }, { status: 503 })
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
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not reach skill runner: ${message}` }, { status: 502 })
  }
}
