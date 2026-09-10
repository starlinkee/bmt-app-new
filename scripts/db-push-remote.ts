/**
 * Puszcza migracje Supabase na środowisko preview/production, ściągając
 * SUPABASE_DB_URL bezpośrednio z Vercela na chwilę operacji — bez trzymania
 * kluczy prod/preview lokalnie na stałe.
 *
 * Uruchom: npm run db:push:preview   albo   npm run db:push:prod
 *
 * Wymaga w .env.local:
 *   VERCEL_ACCESS_TOKEN  — Settings → Tokens w Vercel Dashboard
 * (projekt jest już zlinkowany przez .vercel/project.json, więc więcej nic nie trzeba)
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const target = process.argv[2];

if (target !== "preview" && target !== "production") {
  console.error("Użycie: tsx scripts/db-push-remote.ts <preview|production>");
  process.exit(1);
}

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

function main() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envLocalPath)) {
    console.error("Błąd: nie znaleziono .env.local (potrzebny VERCEL_ACCESS_TOKEN)");
    process.exit(1);
  }

  const localVars = parseEnvFile(envLocalPath);
  const token = localVars["VERCEL_ACCESS_TOKEN"];
  if (!token) {
    console.error("Błąd: brak VERCEL_ACCESS_TOKEN w .env.local");
    process.exit(1);
  }

  const tmpFile = path.resolve(process.cwd(), `.env.${target}.local.tmp`);

  try {
    console.log(`Ściągam zmienne (${target}) z Vercela...`);
    execFileSync(
      "npx",
      ["vercel", "env", "pull", `--environment=${target}`, "--token", token, "--yes", tmpFile],
      { stdio: "inherit" }
    );

    const pulled = parseEnvFile(tmpFile);
    const dbUrl = pulled["SUPABASE_DB_URL"];
    if (!dbUrl) {
      console.error(`Błąd: brak SUPABASE_DB_URL wśród zmiennych ${target} na Vercelu`);
      process.exit(1);
    }

    console.log(`\nPuszczam migracje na ${target}...`);
    execFileSync("npx", ["supabase", "db", "push", "--db-url", dbUrl, "--yes"], {
      stdio: "inherit",
    });

    console.log(`\nGotowe (${target}).`);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

main();
