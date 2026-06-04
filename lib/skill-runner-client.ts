const BASE_PORT = 3021
const MAX_PORT = 3040

let cachedPort: number | null = null
let cacheExpiry = 0

function getBaseUrl(): string | null {
  const url = process.env.SKILL_RUNNER_URL
  if (!url) return null
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.hostname}`
  } catch {
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
      // port unavailable
    }
  }
  return null
}

export async function getVpsUrl(): Promise<string | null> {
  const baseUrl = getBaseUrl()
  if (!baseUrl) return null
  const port = await discoverPort(baseUrl)
  if (!port) return null
  return `${baseUrl}:${port}`
}

export function invalidatePortCache() {
  cachedPort = null
}

export function vpsHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-token': process.env.SKILL_RUNNER_TOKEN ?? '',
  }
}
