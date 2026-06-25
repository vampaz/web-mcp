import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['packages/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts']
  }
})
