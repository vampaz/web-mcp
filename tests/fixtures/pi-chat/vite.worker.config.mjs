import { fileURLToPath } from 'node:url'

export default {
  publicDir: false,
  build: {
    outDir: 'public/webmcp-pi',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./worker.ts', import.meta.url)),
      formats: ['es'],
      fileName: function name() {
        return 'worker.js'
      }
    },
    rollupOptions: { output: { codeSplitting: false } }
  }
}
