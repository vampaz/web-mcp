import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { sourceAliases } from './source-aliases.ts'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: sourceAliases },
  test: {
    environment: 'jsdom',
    include: [
      'packages/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
      'apps/demo/src/**/*.spec.ts'
    ],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/test-utils/**']
    }
  }
})
