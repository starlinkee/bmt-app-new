const express = require('express')
const pty = require('node-pty')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

function stripAnsi(raw) {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    .replace(/\x1b[\x20-\x7e]/g, '')
    .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')
}

function filterOutput(raw) {
  const lines = stripAnsi(raw)
    .split('\n')
    .map(line => line.split('\r').at(-1) ?? line)  // \r = nadpisz linię, weź ostatnią wersję

  const filtered = lines.filter(line => {
    const t = line.trim()
    if (!t) return true                                   // puste linie (odstępy)
    if (t.startsWith('●')) return true                    // akcje i wyniki Claude
    if (t.startsWith('⎿')) return true                    // wyniki narzędzi
    if (/^\s*⎿/.test(line)) return true                   // wcięte wyniki narzędzi
    if (/^\s*(called|calling)\s+\w+/i.test(t)) return true // "Called playwright X times"
    return false
  })

  const out = []
  let blanks = 0
  for (const line of filtered) {
    if (!line.trim()) { if (++blanks <= 1) out.push('') }
    else { blanks = 0; out.push(line.trimEnd()) }
  }
  return out.join('\n').trim()
}

class RawBuffer {
  constructor() { this.raw = '' }
  write(data) { this.raw += data }
  toString() { return this.raw }
}

const app = express()
app.use(express.json())

const SECRET_TOKEN = process.env.SKILL_RUNNER_TOKEN
const WORK_DIR = process.env.WORK_DIR || 'C:\\Users\\Jerzy\\Desktop\\bmt-app-new'
const ALLOWED_SKILLS = ['media-lubostron']

const SKILL_OUTPUT_DIRS = {
  'media-lubostron': process.env.MEDIA_LUBOSTRON_OUTPUT_DIR ||
    'C:\\Users\\Jerzy\\Desktop\\saldo_mmsoft\\Lubostroń 15A_38 Zarządca Nieruchomości Adnier',
}

const FILE_MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function findJobOutputDir(job) {
  const baseDir = SKILL_OUTPUT_DIRS[job.skill]
  if (!baseDir) return null
  try {
    if (!fs.existsSync(baseDir)) return null
    const startTime = new Date(job.startedAt).getTime()
    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const fullPath = path.join(baseDir, e.name)
        const stat = fs.statSync(fullPath)
        return { name: e.name, fullPath, createdMs: stat.birthtimeMs || stat.ctimeMs }
      })
      .filter(d => d.createdMs >= startTime - 5000)
      .sort((a, b) => b.createdMs - a.createdMs)
    return dirs[0] || null
  } catch { return null }
}
const INIT_DELAY_MS = 8000      // czas na inicjalizację Claude
const IDLE_TIMEOUT_MS = 10000   // brak outputu przez 10s = gotowe
const MAX_RUNTIME_MS = 10 * 60 * 1000 // twardy limit 10 minut

const jobs = new Map()

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of jobs.entries()) {
    if (new Date(job.startedAt).getTime() < cutoff) jobs.delete(id)
  }
}, 10 * 60 * 1000)

function requireToken(req, res) {
  if (!SECRET_TOKEN) {
    res.status(503).json({ error: 'SKILL_RUNNER_TOKEN not configured' })
    return false
  }
  if (req.headers['x-token'] !== SECRET_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

function spawnClaude(workDir) {
  const isWindows = process.platform === 'win32'
  if (isWindows) {
    return pty.spawn('cmd.exe', ['/c', 'claude --dangerously-skip-permissions'], {
      cwd: workDir,
      env: { ...process.env },
      cols: 120,
      rows: 30,
    })
  }
  return pty.spawn('claude', ['--dangerously-skip-permissions'], {
    cwd: workDir,
    env: { ...process.env },
    cols: 120,
    rows: 30,
  })
}

app.post('/run-skill', (req, res) => {
  if (!requireToken(req, res)) return

  const { skill } = req.body || {}
  if (!skill || !ALLOWED_SKILLS.includes(skill)) {
    return res.status(400).json({ error: `Skill not allowed: ${skill}` })
  }

  const jobId = crypto.randomUUID()
  jobs.set(jobId, { status: 'running', startedAt: new Date().toISOString(), skill, output: '', proc: null })
  res.json({ jobId, status: 'started', skill })

  console.log(`[${jobId}] Uruchamiam Claude PTY dla /${skill} w ${WORK_DIR}`)

  const buffer = new RawBuffer()
  let proc
  try {
    proc = spawnClaude(WORK_DIR)
  } catch (err) {
    console.error(`[${jobId}] Nie można uruchomić claude:`, err.message)
    const job = jobs.get(jobId)
    if (job) { job.status = 'error'; job.output = err.message; job.finishedAt = new Date().toISOString() }
    return
  }

  // Zapisz referencję do procesu żeby można było go ubić przez /cancel
  const job = jobs.get(jobId)
  if (job) job.proc = proc

  let skillSent = false
  let idleTimer = null
  const maxTimer = setTimeout(() => killProc('timeout'), MAX_RUNTIME_MS)

  function killProc(reason) {
    clearTimeout(idleTimer)
    clearTimeout(maxTimer)
    console.log(`[${jobId}] Kończę proces (${reason})`)
    try { proc.kill() } catch {}
    const job = jobs.get(jobId)
    if (job && job.status === 'running') {
      const current = filterOutput(buffer.toString())
      job.output = current + (current ? '\n\n' : '') + '✓ Zakończono.'
      job.status = 'done'
      job.finishedAt = new Date().toISOString()
    }
  }

  function resetIdleTimer() {
    if (!skillSent) return
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => killProc('idle 60s'), IDLE_TIMEOUT_MS)
  }

  let lastFlush = 0
  proc.onData((data) => {
    process.stdout.write(data)
    buffer.write(data)
    resetIdleTimer()

    const now = Date.now()
    if (now - lastFlush > 2000) {
      lastFlush = now
      const job = jobs.get(jobId)
      if (job) job.output = filterOutput(buffer.toString())
    }
  })

  proc.onExit(({ exitCode }) => {
    console.log(`[${jobId}] Proces zakończony z kodem: ${exitCode}`)
    clearTimeout(idleTimer)
    clearTimeout(maxTimer)
    const job = jobs.get(jobId)
    if (job && job.status === 'running') {
      const current = filterOutput(buffer.toString())
      const msg = exitCode === 0 ? '✓ Zakończono.' : `✗ Błąd (kod: ${exitCode}).`
      job.output = current + (current ? '\n\n' : '') + msg
      job.status = exitCode === 0 ? 'done' : 'error'
      job.finishedAt = new Date().toISOString()
    }
  })

  // Wyślij komendę po INIT_DELAY_MS (czas na załadowanie Claude)
  setTimeout(() => {
    try {
      proc.write(`/${skill}\r`)
      skillSent = true
      console.log(`[${jobId}] Wysłano: /${skill}`)
      resetIdleTimer()
    } catch (e) {
      console.error(`[${jobId}] Błąd wysyłania komendy:`, e.message)
    }
  }, INIT_DELAY_MS)
})

app.get('/job/:id', (req, res) => {
  if (!requireToken(req, res)) return
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  const { proc: _proc, ...safe } = job
  res.json(safe)
})

app.post('/job/:id/cancel', (req, res) => {
  if (!requireToken(req, res)) return
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  if (job.status !== 'running') return res.json({ status: job.status })

  console.log(`[${req.params.id}] Anulowano przez użytkownika`)
  try { job.proc?.kill() } catch {}
  job.status = 'error'
  job.finishedAt = new Date().toISOString()
  job.output = (job.output ? job.output + '\n\n' : '') + '✗ Przerwano przez użytkownika.'
  res.json({ status: 'error' })
})

app.get('/job/:id/files', (req, res) => {
  if (!requireToken(req, res)) return
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  const dir = findJobOutputDir(job)
  if (!dir) return res.json({ files: [], folder: null })

  try {
    const files = fs.readdirSync(dir.fullPath)
      .filter(name => fs.statSync(path.join(dir.fullPath, name)).isFile())
      .map(name => {
        const stat = fs.statSync(path.join(dir.fullPath, name))
        return { name, size: stat.size, ext: path.extname(name).toLowerCase() }
      })
    res.json({ files, folder: dir.name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/job/:id/file', (req, res) => {
  if (!requireToken(req, res)) return
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  const fileName = req.query.name
  if (!fileName || /[/\\]|\.\./.test(fileName)) {
    return res.status(400).json({ error: 'Invalid file name' })
  }

  const dir = findJobOutputDir(job)
  if (!dir) return res.status(404).json({ error: 'No output directory found' })

  const fullPath = path.join(dir.fullPath, fileName)
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' })

  const ext = path.extname(fileName).toLowerCase()
  const contentType = FILE_MIME_TYPES[ext] || 'application/octet-stream'
  const inline = Object.values(FILE_MIME_TYPES).includes(contentType)

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  fs.createReadStream(fullPath).pipe(res)
})

app.get('/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3021
app.listen(PORT, () => console.log(`Skill runner na porcie ${PORT}`))
