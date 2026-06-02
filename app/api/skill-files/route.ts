import { NextRequest, NextResponse } from 'next/server'

function vpsFileHeaders() {
  return { 'x-token': process.env.SKILL_RUNNER_TOKEN ?? '' }
}

function getVpsUrl() {
  return process.env.SKILL_RUNNER_URL
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

  const fileName = req.nextUrl.searchParams.get('file')

  try {
    if (fileName) {
      const res = await fetch(
        `${vpsUrl}/job/${jobId}/file?name=${encodeURIComponent(fileName)}`,
        { headers: vpsFileHeaders(), signal: AbortSignal.timeout(30_000) }
      )
      if (!res.ok) {
        return NextResponse.json(await res.json(), { status: res.status })
      }
      const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream'
      const contentDisposition = res.headers.get('Content-Disposition') ?? 'inline'
      return new NextResponse(res.body, {
        headers: { 'Content-Type': contentType, 'Content-Disposition': contentDisposition },
      })
    }

    const res = await fetch(
      `${vpsUrl}/job/${jobId}/files`,
      { headers: vpsFileHeaders(), signal: AbortSignal.timeout(10_000) }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not reach skill runner: ${message}` }, { status: 502 })
  }
}
