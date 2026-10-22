import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(
  await readFile(new URL('./node_modules/@vampaz/webmcp-kit/package.json', import.meta.url), 'utf8')
)
const entries = Object.keys(manifest.exports).filter(function code(path) {
  return path !== './package.json'
})
for (const path of entries) {
  const name = manifest.name + path.slice(1)
  const module = await import(name)
  assert.ok(
    Object.values(module).some(function callable(value) {
      return typeof value === 'function'
    }),
    `${name} exports no functions.`
  )
}
console.log(`all-entries passed ${entries.length} entries`)
