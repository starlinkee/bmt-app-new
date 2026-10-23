import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // 'server-only' rzuca poza bundlem Next.js - w testach podstawiamy pusty moduł.
    alias: { 'server-only': new URL('./tests-support/server-only-stub.ts', import.meta.url).pathname },
  },
  test: {
    environment: 'node',
    include: ['__tests__/unit/**/*.test.ts'],
    setupFiles: ['__tests__/unit/setup.ts'],
    globals: true,
  },
})
