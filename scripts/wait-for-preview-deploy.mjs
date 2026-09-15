#!/usr/bin/env node
/**
 * Czeka, aż Vercel zbuduje deployment preview dla konkretnego commita na danym
 * branchu, i wypisuje na stdout sam hostname gotowego deploya (bez https://).
 *
 * Używane przez scripts/push-master.sh jako bramka e2e przed mergem do master:
 * bez tego testy Playwright celowałyby w STARY, jeszcze niezaktualizowany
 * deployment brancha "dev" (Vercel builduje go dopiero po `git push`).
 *
 * Użycie: node scripts/wait-for-preview-deploy.mjs <commitSha> <branch> [timeoutSec]
 *
 * Celowo nie wywołuje process.exit() - na Windows koliduje to z otwartym
 * socketem po `fetch` (crash w libuv nadpisujący kod wyjścia). Zamiast tego
 * ustawiamy process.exitCode i pozwalamy skryptowi zakończyć się naturalnie.
 */

import fs from 'fs'
import path from 'path'

function parseEnvFile(filePath) {
  const result = {}
  if (!fs.existsSync(filePath)) return result
  for (const raw of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    let value = line.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) result[key] = value
  }
  return result
}

async function main() {
  const [, , sha, branch, timeoutSecArg] = process.argv
  if (!sha || !branch) {
    console.error('Użycie: node scripts/wait-for-preview-deploy.mjs <commitSha> <branch> [timeoutSec]')
    process.exitCode = 1
    return
  }

  const repoRoot = path.resolve(import.meta.dirname, '..')
  const envVars = {
    ...parseEnvFile(path.join(repoRoot, '.env.development')),
    ...parseEnvFile(path.join(repoRoot, '.env.local')),
    ...process.env,
  }

  const token = envVars.VERCEL_ACCESS_TOKEN
  if (!token) {
    console.error('Błąd: brak VERCEL_ACCESS_TOKEN (sprawdź .env.local / .env.development).')
    process.exitCode = 1
    return
  }

  const repoJsonPath = path.join(repoRoot, '.vercel', 'repo.json')
  if (!fs.existsSync(repoJsonPath)) {
    console.error('Błąd: brak .vercel/repo.json - projekt nie jest zlinkowany z Vercelem (npx vercel link).')
    process.exitCode = 1
    return
  }
  const repoJson = JSON.parse(fs.readFileSync(repoJsonPath, 'utf-8'))
  const project = repoJson.projects?.[0]
  if (!project) {
    console.error('Błąd: nie znaleziono projektu w .vercel/repo.json.')
    process.exitCode = 1
    return
  }

  const timeoutMs = (Number(timeoutSecArg) || 300) * 1000
  const pollIntervalMs = 10_000
  const startedAt = Date.now()

  async function findDeployment() {
    const url = `https://api.vercel.com/v6/deployments?projectId=${project.id}&teamId=${project.orgId}&limit=15`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      throw new Error(`Vercel API ${res.status}: ${await res.text()}`)
    }
    const body = await res.json()
    return (body.deployments ?? []).find(
      (d) => d.meta?.githubCommitSha === sha && d.meta?.githubCommitRef === branch,
    )
  }

  console.error(`Czekam na deployment preview dla commita ${sha.slice(0, 7)} na branchu "${branch}"...`)

  for (;;) {
    let deployment
    try {
      deployment = await findDeployment()
    } catch (err) {
      console.error(`Błąd zapytania do Vercel API: ${err.message}`)
      process.exitCode = 1
      return
    }

    if (deployment) {
      if (deployment.readyState === 'READY') {
        console.error(`Deployment gotowy: https://${deployment.url}`)
        console.log(deployment.url)
        return
      }
      if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
        console.error(`Build zakończył się stanem ${deployment.readyState}: ${deployment.inspectorUrl ?? deployment.url}`)
        process.exitCode = 1
        return
      }
      console.error(`  ...status: ${deployment.readyState}`)
    } else {
      console.error('  ...deployment jeszcze nie widoczny w API Vercela')
    }

    if (Date.now() - startedAt > timeoutMs) {
      console.error(`Przekroczono limit czasu (${timeoutMs / 1000}s) oczekiwania na deployment.`)
      process.exitCode = 1
      return
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
}

await main()
