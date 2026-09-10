// Krok builda na Vercelu: przed `next build` wypycha oczekujące migracje
// Supabase na bazę środowiska, na które właśnie budujemy (production/preview).
//
// SUPABASE_DB_URL jest już wstrzykiwana przez Vercel (Project Settings → Environment
// Variables, per-environment) — nie trzeba nic dociągać ani logować się do Vercela.
//
// Jeśli push migracji się nie powiedzie, build się wywala — to celowe:
// lepiej zablokować deploy niż wypuścić kod niezgodny ze schematem bazy.

import { execFileSync } from "node:child_process";

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.log("[vercel-build] Brak SUPABASE_DB_URL w środowisku builda — pomijam db push.");
} else {
  console.log(`[vercel-build] Puszczam migracje Supabase (VERCEL_ENV=${process.env.VERCEL_ENV ?? "?"})...`);
  execFileSync("npx", ["supabase", "db", "push", "--db-url", dbUrl, "--yes"], {
    stdio: "inherit",
  });
  console.log("[vercel-build] Migracje OK.");
}
