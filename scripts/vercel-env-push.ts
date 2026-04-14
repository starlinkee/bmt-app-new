/**
 * Skrypt pushujący zmienne z .env.local do Vercel przez API.
 * Uruchom: npm run vercel:env
 *
 * Wymagane zmienne w .env.local:
 *   VERCEL_ACCESS_TOKEN  — Settings → Tokens w Vercel Dashboard
 *   VERCEL_PROJECT_ID    — Settings → General → Project ID
 *   VERCEL_TEAM_ID       — (opcjonalne) Settings → General → Team ID
 */

import fs from "fs";
import path from "path";
import readline from "readline";

const ENVS = ["production", "preview", "development"] as const;
type VercelEnv = (typeof ENVS)[number];

interface EnvPayload {
  key: string;
  value: string;
  type: "encrypted";
  target: VercelEnv[];
}

interface VercelErrorResponse {
  error?: { message?: string };
}

// ---------------------------------------------------------------------------
// Parsowanie .env
// ---------------------------------------------------------------------------

function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // Usuń opcjonalne cudzysłowy
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Vercel API
// ---------------------------------------------------------------------------

async function upsertEnvVar(
  token: string,
  projectId: string,
  teamId: string | undefined,
  payload: EnvPayload
): Promise<void> {
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${qs}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 409) {
    // Zmienna już istnieje — pobierz jej ID i nadpisz przez PATCH
    await patchEnvVar(token, projectId, teamId, payload);
    return;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as VercelErrorResponse;
    throw new Error(
      `POST ${payload.key} → HTTP ${res.status}: ${body?.error?.message ?? res.statusText}`
    );
  }
}

async function patchEnvVar(
  token: string,
  projectId: string,
  teamId: string | undefined,
  payload: EnvPayload
): Promise<void> {
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  // Pobierz listę zmiennych żeby znaleźć ID
  const listUrl = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${qs}`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    throw new Error(`GET env list → HTTP ${listRes.status}`);
  }

  const listBody = (await listRes.json()) as { envs?: { id: string; key: string }[] };
  const existing = listBody.envs?.find((e) => e.key === payload.key);

  if (!existing) {
    throw new Error(`PATCH ${payload.key}: nie znaleziono ID mimo konfliktu`);
  }

  const patchUrl = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env/${existing.id}${qs}`;
  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!patchRes.ok) {
    const body = (await patchRes.json().catch(() => ({}))) as VercelErrorResponse;
    throw new Error(
      `PATCH ${payload.key} → HTTP ${patchRes.status}: ${body?.error?.message ?? patchRes.statusText}`
    );
  }
}

// ---------------------------------------------------------------------------
// Potwierdzenie interaktywne
// ---------------------------------------------------------------------------

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");

  if (!fs.existsSync(envLocalPath)) {
    console.error("Błąd: nie znaleziono .env.local");
    process.exit(1);
  }

  const vars = parseEnvFile(envLocalPath);

  const token = vars["VERCEL_ACCESS_TOKEN"];
  const projectId = vars["VERCEL_PROJECT_ID"];
  const teamId = vars["VERCEL_TEAM_ID"] || undefined;

  if (!token || !projectId) {
    console.error(
      "Błąd: brak VERCEL_ACCESS_TOKEN lub VERCEL_PROJECT_ID w .env.local"
    );
    process.exit(1);
  }

  // Klucze Vercel nie trafiają do Vercel
  const SKIP = new Set(["VERCEL_ACCESS_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"]);
  const toUpload = Object.entries(vars).filter(([key]) => !SKIP.has(key));

  if (toUpload.length === 0) {
    console.log("Brak zmiennych do wysłania.");
    return;
  }

  console.log(`\nZmienne do wysłania (${toUpload.length}):`);
  for (const [key] of toUpload) {
    console.log(`  ${key}`);
  }
  console.log(`\nŚrodowiska: ${ENVS.join(", ")}`);
  if (teamId) console.log(`Team ID: ${teamId}`);

  const ok = await confirm("\nWysłać? [y/N] ");
  if (!ok) {
    console.log("Anulowano.");
    return;
  }

  console.log("");
  let ok_count = 0;
  let fail_count = 0;

  for (const [key, value] of toUpload) {
    process.stdout.write(`  ${key} ... `);
    try {
      await upsertEnvVar(token, projectId, teamId, {
        key,
        value,
        type: "encrypted",
        target: [...ENVS],
      });
      console.log("ok");
      ok_count++;
    } catch (err) {
      console.log(`BŁĄD: ${err instanceof Error ? err.message : err}`);
      fail_count++;
    }
  }

  console.log(`\nGotowe: ${ok_count} ok, ${fail_count} błędów`);
  if (fail_count > 0) process.exit(1);
}

main();
