import vue from '@vitejs/plugin-vue'
import { compile } from 'svelte/compiler'
import { defineConfig } from 'vitest/config'
import { sourceAliases } from './source-aliases.ts'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'vitest-svelte-compile',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.svelte')) return
        const result = compile(code, { filename: id, generate: 'client', css: 'injected' })
        return { code: result.js.code, map: result.js.map }
      }
    }
  ],
  resolve: {
    alias: sourceAliases,
    conditions: ['browser', 'module', 'development|production']
  },
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
