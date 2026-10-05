import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import path from 'path'

// Testy integracyjne wołają server actions na PRAWDZIWEJ bazie Supabase
// środowiska preview (dane z prefiksem E2E_TEST__), więc czytamy wyłącznie
// .env.e2e - nigdy .env.local (tam są klucze dev/prod, w tym hasło Gmail i
// credentiale Google). `override: true`, żeby zmienna wyeksportowana w powłoce
// nie podmieniła celu testów.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e'), override: true, quiet: true })

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['__tests__/integration/**/*.test.ts'],
    globals: true,
    globalSetup: ['__tests__/integration/global-setup.ts'],
    setupFiles: ['__tests__/integration/setup.ts'],
    // Jedna współdzielona baza i wspólny wiersz app_config - pliki lecą po kolei.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      // Zachowuj się jak deploy preview: prefiks "[PREVIEW]" w e-mailach,
      // ścieżki Storage z prefiksem preview/ (patrz lib/env.ts, lib/email.ts).
      VERCEL_ENV: 'preview',
      // Nawet gdyby nodemailer przestał być zamockowany, nie ma czym się zalogować.
      GMAIL_APP_PASSWORD: 'integration-tests-not-a-real-password',
      CRON_SECRET: 'integration-tests-cron-secret',
    },
  },
})
