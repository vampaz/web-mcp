import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { sourceDigest } from './scripts/package-artifact'
import { packageEntries } from './source-aliases'

let buildDigest: string

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
        await appendFile(
          'dist/THIRD-PARTY-NOTICES.md',
          '\n## Pi implementation libraries\n\n@earendil-works/chord, @earendil-works/pi-ai, and @earendil-works/pi-durable 1.3.0.\nSource: https://github.com/earendil-works/pi/blob/v1.3.0/LICENSE\n\n' +
            (await readFile('licenses/pi-MIT.txt', 'utf8'))
        )
        await writeFile('dist/build.json', JSON.stringify({ sourceDigest: buildDigest }) + '\n')
      }
    },
    dts({
      exclude: ['**/*.spec.ts', '**/__snapshots__/**', '**/test-utils/**'],
      include: ['packages/**/*.ts'],
      outDirs: 'dist',
      pathsToAliases: false,
      beforeWriteFile(filePath, content) {
        return {
          filePath,
          content: content.replace(
            /((?:from\s*|import\s*\()\s*['"])(\.\.?\/[^'"]+)(['"])/g,
            function extension(_match, prefix: string, specifier: string, suffix: string) {
              return (
                prefix +
                (/\.(?:[cm]?js|json)$/.test(specifier)
                  ? specifier
                  : specifier.replace(/\.ts$/, '') + '.js') +
                suffix
              )
            }
          )
        }
      }
    })
  ],
  build: {
    emptyOutDir: true,
    license: { fileName: 'THIRD-PARTY-NOTICES.md' },
    lib: {
      entry: Object.fromEntries(
        packageEntries.map(function entry(item) {
          return [item.name, item.source]
        })
      ),
      fileName,
      formats: ['es']
    },
    rollupOptions: {
      external(id) {
        return ['@vampaz/webmcp-kit', 'react', 'svelte', 'svelte/store', 'vue', 'zod'].includes(id)
      }
    },
    sourcemap: true
  }
})
