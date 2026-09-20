import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

// Zmienne wskazujące na środowisko preview (Vercel) i jego bazę Supabase.
// Trzymane osobno od .env.local, bo to inne środowisko.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') })

const baseURL = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 4,
  reporter: [['html', { open: 'never' }]],
  timeout: 30_000,

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Deploymenty preview mają włączony Vercel Deployment Protection (SSO) -
    // bez tego nagłówka każde żądanie ląduje na ekranie logowania do Vercela
    // zamiast w aplikacji. Sekret pochodzi z "Protection Bypass for Automation"
    // w ustawieniach projektu na Vercelu.
    ...(process.env.VERCEL_PROTECTION_BYPASS_SECRET
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': process.env.VERCEL_PROTECTION_BYPASS_SECRET,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(__dirname, 'e2e/.auth/user.json'),
      },
      dependencies: ['setup'],
    },
  ],
})
