import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['__tests__/unit/**/*.test.ts'],
    globals: true,
  },
})
