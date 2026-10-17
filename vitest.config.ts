import { defineConfig } from 'vitest/config'
import { sourceAliases } from './source-aliases'

export default defineConfig({
  resolve: { alias: sourceAliases },
  test: {
    environment: 'jsdom',
    include: [
      'packages/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
      'apps/demo/src/**/*.spec.ts'
    ],
    setupFiles: ['./vitest.setup.ts']
  }
})
