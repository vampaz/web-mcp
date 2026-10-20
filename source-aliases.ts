import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  name: string
  exports: Record<string, string | { types: string }>
}

export const packageEntries = Object.entries(manifest.exports).flatMap(function entry([
  path,
  value
]) {
  if (typeof value === 'string') return []
  return [
    {
      path,
      name: path === '.' ? 'index' : path.slice(2),
      source: fileURLToPath(
        new URL(value.types.replace('./dist/', './').replace(/\.d\.ts$/, '.ts'), import.meta.url)
      )
    }
  ]
})

export const sourceAliases = packageEntries.map(function alias(entry) {
  const name = manifest.name + (entry.path === '.' ? '' : entry.path.slice(1))
  return { find: new RegExp(`^${name}$`), replacement: entry.source }
})
