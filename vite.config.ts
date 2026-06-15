import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

function resolveEntry(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

function fileName(_format: string, entryName: string): string {
  return `${entryName}.js`
}

export default defineConfig({
  plugins: [
    dts({
      exclude: ['**/*.spec.ts', '**/__snapshots__/**', '**/test-utils/**'],
      include: ['packages/**/*.ts'],
      outDirs: 'dist',
      pathsToAliases: false
    })
  ],
  build: {
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolveEntry('./packages/core/src/index.ts'),
        devtools: resolveEntry('./packages/devtools/src/index.ts'),
        'mcp-bridge': resolveEntry('./packages/mcp-bridge/src/index.ts'),
        react: resolveEntry('./packages/react/src/index.ts'),
        svelte: resolveEntry('./packages/svelte/src/index.ts'),
        testing: resolveEntry('./packages/testing/src/index.ts'),
        'testing/playwright': resolveEntry('./packages/testing/src/playwright.ts'),
        vue: resolveEntry('./packages/vue/src/index.ts'),
        zod: resolveEntry('./packages/zod/src/index.ts')
      },
      fileName,
      formats: ['es']
    },
    rollupOptions: {
      external: [
        '@playwright/test',
        '@vampaz/webmcp-kit',
        'react',
        'svelte',
        'svelte/store',
        'vue',
        'zod'
      ]
    },
    sourcemap: true
  }
})
