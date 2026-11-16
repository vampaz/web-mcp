import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  exports: Record<string, string | { types?: string }>
}
const configs = [
  { file: 'tsconfig.base.json', prefix: './' },
  { file: 'apps/demo/tsconfig.json', prefix: '../../' }
]

function sourceFile(types: string): string {
  return types.replace('./dist/', '').replace(/\.d\.ts$/, '.ts')
}

it('maps every public source sub-entry in the root and demo TypeScript paths', function paths() {
  const entries = Object.entries(manifest.exports).filter(function typed(entry): entry is [
    string,
    { types: string }
  ] {
    return typeof entry[1] !== 'string' && typeof entry[1].types === 'string'
  })

  for (const config of configs) {
    const json = JSON.parse(readFileSync(join(root, config.file), 'utf8')) as {
      compilerOptions?: { paths?: Record<string, string[]> }
    }
    const paths = json.compilerOptions?.paths ?? {}
    for (const [exportPath, value] of entries) {
      const source = sourceFile(value.types)
      expect(existsSync(join(root, source)), `${source} exists`).toBe(true)
      // One wildcard maps "package/src/index.ts"; deeper source entries need an explicit key.
      if (
        exportPath === '.' ||
        existsSync(join(root, 'packages', exportPath.slice(2), 'src/index.ts'))
      )
        continue
      const key = manifest.name + exportPath.slice(1)
      expect(paths[key], `${config.file} needs an explicit source path for ${key}`).toContain(
        `${config.prefix}${source}`
      )
    }
  }
})
