const express = require('express')
const pty = require('node-pty')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Always load .env from the script directory (overrides existing env vars)
const envFile = path.join(__dirname, '.env')
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.trim().startsWith('#')) {
      process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
  })
}

function stripAnsi(raw) {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    .replace(/\x1b[\x20-\x7e]/g, '')
    .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')
}

function filterOutput(raw) {
  // Split by both \r and \n — terminal uses cursor positioning (\x1b[22;1H) so after
  // stripAnsi, ● content often ends up concatenated with spinner on the same \n-line.
  // Splitting by \r too gives us smaller segments where ● is easier to find.
  const segments = stripAnsi(raw).split(/\r?\n|\r/)

  const result = []
  let prevBullet = false
  let lastPushed = null

  for (const seg of segments) {
    const bulletIdx = seg.indexOf('●')
    const toolIdx = seg.indexOf('⎿')

    let line = null

    if (bulletIdx !== -1 && (toolIdx === -1 || bulletIdx < toolIdx)) {
      line = seg.slice(bulletIdx).trimEnd()
      prevBullet = true
    } else if (toolIdx !== -1) {
      line = seg.slice(toolIdx).trimEnd()
      prevBullet = true
    } else if (!seg.trim()) {
      if (prevBullet && lastPushed !== '') { result.push(''); lastPushed = '' }
      continue
    } else if (prevBullet && /^ /.test(seg)) {
      line = seg.trimEnd()
    } else if (/^\s*(called|calling)\s+\w+/i.test(seg.trim())) {
      line = seg.trim()
      prevBullet = true
    } else {
      prevBullet = false
      continue
    }

    if (line !== null && line !== lastPushed) {
      result.push(line)
      lastPushed = line
    }
  }

  return result.join('\n').trim()
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
const OUTPUT_BASE_DIR = process.env.OUTPUT_BASE_DIR || path.join(WORK_DIR, 'claude_code_results')
const ALLOWED_SKILLS = ['media-lubostron', 'kurs-walut']

const PROMPTS_FILE = path.join(__dirname, 'prompts.json')

function loadPrompts() {
  try { return JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8')) } catch { return {} }
}

function savePrompts(prompts) {
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2))
}

function skillCommandPath(skillId) {
  return path.join(WORK_DIR, '.claude', 'commands', `${skillId}.md`)
}

function applyPrompt(skillId, content) {
  const cmdPath = skillCommandPath(skillId)
  fs.mkdirSync(path.dirname(cmdPath), { recursive: true })
  fs.writeFileSync(cmdPath, content, 'utf8')
}

// Dla każdego skilla sprawdza env var OUTPUT_DIR_<SKILL_ID_UPPERCASE> (myślniki → podkreślniki).
// Np. media-lubostron → OUTPUT_DIR_MEDIA_LUBOSTRON. Jeśli brak, subfolder = skill id.
function skillOutputDir(skillId) {
  const envKey = 'OUTPUT_DIR_' + skillId.toUpperCase().replace(/-/g, '_')
  const sub = process.env[envKey] || skillId
  return path.join(OUTPUT_BASE_DIR, sub)
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
  const baseDir = skillOutputDir(job.skill)
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
  const runAsUser = process.env.CLAUDE_RUN_AS
  if (runAsUser) {
    return pty.spawn('su', ['-s', '/bin/bash', '-c', `cd ${workDir} && claude --dangerously-skip-permissions`, runAsUser], {
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

  // Nadpisz .md aktualnym promptem z prompts.json (jeśli istnieje)
  const prompts = loadPrompts()
  if (typeof prompts[skill] === 'string') applyPrompt(skill, prompts[skill])

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
    fs.writeFileSync(path.join(os.tmpdir(), `skill-debug-${jobId}.log`), stripAnsi(buffer.toString()))
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

app.get('/browse', (req, res) => {
  if (!requireToken(req, res)) return
  if (!fs.existsSync(OUTPUT_BASE_DIR)) return res.json({ skills: [] })
  try {
    const skills = fs.readdirSync(OUTPUT_BASE_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(skillDir => {
        const skillPath = path.join(OUTPUT_BASE_DIR, skillDir.name)
        let runs = []
        try {
          runs = fs.readdirSync(skillPath, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(runDir => {
              const runPath = path.join(skillPath, runDir.name)
              const stat = fs.statSync(runPath)
              let files = []
              try {
                files = fs.readdirSync(runPath)
                  .filter(name => fs.statSync(path.join(runPath, name)).isFile())
                  .map(name => {
                    const fileStat = fs.statSync(path.join(runPath, name))
                    return { name, size: fileStat.size, ext: path.extname(name).toLowerCase() }
                  })
              } catch {}
              return { name: runDir.name, createdMs: stat.birthtimeMs || stat.ctimeMs, files }
            })
            .sort((a, b) => b.createdMs - a.createdMs)
        } catch {}
        return { name: skillDir.name, runs }
      })
    res.json({ skills })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/file', (req, res) => {
  if (!requireToken(req, res)) return
  const relPath = req.query.path
  if (!relPath || typeof relPath !== 'string') return res.status(400).json({ error: 'Missing path' })

  const fullPath = path.resolve(OUTPUT_BASE_DIR, relPath)
  const base = path.resolve(OUTPUT_BASE_DIR)
  if (!fullPath.startsWith(base + path.sep) && fullPath !== base) {
    return res.status(403).json({ error: 'Access denied' })
  }
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return res.status(404).json({ error: 'File not found' })
  }

  const ext = path.extname(fullPath).toLowerCase()
  const contentType = FILE_MIME_TYPES[ext] || 'application/octet-stream'
  const inline = Object.values(FILE_MIME_TYPES).includes(contentType)
  const fileName = path.basename(fullPath)

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  fs.createReadStream(fullPath).pipe(res)
})

app.get('/skill/:id/prompt', (req, res) => {
  if (!requireToken(req, res)) return
  const { id } = req.params
  if (!ALLOWED_SKILLS.includes(id)) return res.status(400).json({ error: 'Unknown skill' })
  const prompts = loadPrompts()
  if (typeof prompts[id] === 'string') return res.json({ content: prompts[id] })
  try {
    const content = fs.readFileSync(skillCommandPath(id), 'utf8')
    res.json({ content })
  } catch {
    res.json({ content: '' })
  }
})

app.put('/skill/:id/prompt', (req, res) => {
  if (!requireToken(req, res)) return
  const { id } = req.params
  if (!ALLOWED_SKILLS.includes(id)) return res.status(400).json({ error: 'Unknown skill' })
  const { content } = req.body || {}
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' })
  const prompts = loadPrompts()
  prompts[id] = content
  savePrompts(prompts)
  applyPrompt(id, content)
  res.json({ ok: true })
})

app.get('/health', (_req, res) => res.json({ ok: true }))

const BASE_PORT = Number(process.env.PORT) || 3021
const REGISTRY_FILE = path.join(__dirname, '.registry.json')

function readRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')) } catch { return [] }
}

function registerPort(port) {
  const reg = readRegistry().filter(e => {
    try { process.kill(e.pid, 0); return true } catch { return false }
  })
  reg.push({ pid: process.pid, port, startedAt: new Date().toISOString() })
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2))
  // backward compat – last port also in .port
  fs.writeFileSync(path.join(__dirname, '.port'), String(port))

  process.on('exit', () => {
    const updated = readRegistry().filter(e => e.pid !== process.pid)
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(updated, null, 2))
  })
}

app.get('/registry', (_req, res) => {
  const alive = readRegistry().filter(e => {
    try { process.kill(e.pid, 0); return true } catch { return false }
  })
  res.json(alive)
})

function listenOnFreePort(port, maxTries = 20) {
  const server = app.listen(port, () => {
    const actual = server.address().port
    registerPort(actual)
    console.log(`Skill runner na porcie ${actual} (pid ${process.pid})`)
  })
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxTries > 0) {
      console.log(`Port ${port} zajęty, próbuję ${port + 1}...`)
      listenOnFreePort(port + 1, maxTries - 1)
    } else {
      throw err
    }
  })
}

listenOnFreePort(BASE_PORT)
