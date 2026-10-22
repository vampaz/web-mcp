import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { readFileSync } from 'node:fs'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { sourceDigest } from './scripts/package-artifact.ts'
import { packageEntries } from './source-aliases.ts'

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  name: string
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const externalPackages = [manifest.name, ...Object.keys(manifest.peerDependencies)]
const piLibraries = Object.keys(manifest.devDependencies).filter(function bundledPi(name) {
  return name.startsWith('@earendil-works/')
})
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
        const versions = await Promise.all(
          piLibraries.map(async function installedVersion(name) {
            const installed = JSON.parse(
              await readFile(`node_modules/${name}/package.json`, 'utf8')
            ) as { version: string }
            return installed.version
          })
        )
        const libraries = new Intl.ListFormat('en', { type: 'conjunction' }).format(
          piLibraries.map(function library(name, index) {
            return `${name} ${versions[index]}`
          })
        )
        const sources = [...new Set(versions)].map(function source(version) {
          return `https://github.com/earendil-works/pi/blob/v${version}/LICENSE`
        })
        await appendFile(
          'dist/THIRD-PARTY-NOTICES.md',
          `\n## Pi implementation libraries\n\n${libraries}.\nSource: ${sources.join(', ')}\n\n` +
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
    rolldownOptions: {
      external(id) {
        return externalPackages.some(function matches(name) {
          return id === name || id.startsWith(`${name}/`)
        })
      },
      output: { sourcemapExcludeSources: true }
    },
    sourcemap: true
  }
})
