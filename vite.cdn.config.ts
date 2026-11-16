import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { sourceAliases } from './source-aliases.ts'

const browserAuthContext = `
export function defaultProviderAuthContext() {
  return {
    async env(name) {
      const value = globalThis.process?.env?.[name]
      return typeof value === 'string' && value.trim().length > 0 ? value : undefined
    },
    async fileExists() {
      return false
    }
  }
}
`

export default defineConfig({
  resolve: { alias: sourceAliases },
  plugins: [
    {
      name: 'cdn-browser-auth-context',
      load(id) {
        if (id.endsWith('/@earendil-works/pi-ai/dist/auth/context.js')) return browserAuthContext
      }
    }
  ],
  build: {
    outDir: 'dist/cdn',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./scripts/cdn-entry.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'webmcp-kit.js'
    },
    rolldownOptions: {
      output: {
        codeSplitting: false,
        sourcemapExcludeSources: true
      }
    },
    sourcemap: true
  }
})
