import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { writeFile } from 'node:fs/promises'
import { sourceDigest } from './scripts/package-artifact'

let buildDigest: string

function resolveEntry(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

function fileName(_format: string, entryName: string): string {
  return `${entryName}.js`
}

export default defineConfig({
  plugins: [
    {
      name: 'package-source-digest',
      async buildStart() {
        buildDigest = await sourceDigest(process.cwd())
      },
      async closeBundle() {
        if (buildDigest !== (await sourceDigest(process.cwd())))
          throw new Error('Sources changed during the package build. Build a fresh artifact.')
        await writeFile('dist/build.json', JSON.stringify({ sourceDigest: buildDigest }) + '\n')
      }
    },
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
        pi: resolveEntry('./packages/pi/src/index.ts'),
        'pi/worker': resolveEntry('./packages/pi/src/worker.ts'),
        chat: resolveEntry('./packages/chat/src/index.ts'),
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
      external(id) {
        return (
          id.startsWith('@earendil-works/') ||
          ['@vampaz/webmcp-kit', 'react', 'svelte', 'svelte/store', 'vue', 'zod'].includes(id)
        )
      }
    },
    sourcemap: true
  }
})
