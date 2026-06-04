import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_SKILLS = ['media-lubostron', 'kurs-walut'] as const
type AllowedSkill = (typeof ALLOWED_SKILLS)[number]

const BASE_PORT = 3021
const MAX_PORT = 3040

// Cache aktywnego portu — ważny przez 60 sekund
let cachedPort: number | null = null
let cacheExpiry = 0

function getBaseUrl(): string | null {
  const url = process.env.SKILL_RUNNER_URL
  if (!url) return null
  // Usuń port jeśli podany — sami go odkryjemy
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.hostname}`
  } catch {
    // Nie jest pełnym URL, traktuj jako host
    return url.replace(/:\d+$/, '')
  }
}

async function discoverPort(baseUrl: string): Promise<number | null> {
  const now = Date.now()
  if (cachedPort !== null && now < cacheExpiry) return cachedPort

  for (let port = BASE_PORT; port <= MAX_PORT; port++) {
    try {
      const res = await fetch(`${baseUrl}:${port}/health`, {
        signal: AbortSignal.timeout(1_000),
      })
      if (res.ok) {
        cachedPort = port
        cacheExpiry = now + 60_000
        return port
      }
    } catch {
      // port niedostępny, próbuj następny
    }
  }
  return null
}

async function getVpsUrl(): Promise<string | null> {
  const baseUrl = getBaseUrl()
  if (!baseUrl) return null
  const port = await discoverPort(baseUrl)
  if (!port) return null
  return `${baseUrl}:${port}`
}

function vpsHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-token': process.env.SKILL_RUNNER_TOKEN ?? '',
  }
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
    cachedPort = null // wymuś ponowne szukanie przy następnym żądaniu
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
    cachedPort = null
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
    cachedPort = null
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not reach skill runner: ${message}` }, { status: 502 })
  }
}
