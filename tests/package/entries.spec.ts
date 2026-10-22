import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { artifact, checkTypes, installFixture, run } from './fixtures'

function minimumVersion(range: string): string {
  return [...range.replace(/^>=/, '').split('.'), '0', '0'].slice(0, 3).join('.')
}

it('typechecks and imports every entry with the minimum framework peers', async function allEntries() {
  const fixture = await installFixture('all-entries')
  try {
    const { stdout: raw } = await run('tar', ['-xOf', artifact, 'package/package.json'])
    const manifest = JSON.parse(raw) as {
      name: string
      exports: Record<string, unknown>
      peerDependencies: Record<string, string>
    }
    const entries = Object.keys(manifest.exports)
      .filter(function code(path) {
        return path !== './package.json'
      })
      .map(function specifier(path) {
        return manifest.name + path.slice(1)
      })
    const consumer = JSON.parse(await readFile(join(fixture.directory, 'package.json'), 'utf8'))
    expect(consumer.dependencies).toEqual(
      Object.fromEntries(
        Object.entries(manifest.peerDependencies).map(function minimum([name, range]) {
          return [name, minimumVersion(range)]
        })
      )
    )
    const source = await readFile(join(fixture.directory, 'main.ts'), 'utf8')
    const imported = Array.from(
      source.matchAll(/from '(@vampaz\/webmcp-kit[^']*)'/g),
      function name(match) {
        return match[1]
      }
    )
    expect(imported.sort()).toEqual(entries.sort())
    await checkTypes(fixture.directory)
    await checkTypes(fixture.directory, 'tsconfig.nodenext.json')
    const { stdout } = await run(process.execPath, ['check.mjs'], { cwd: fixture.directory })
    expect(stdout).toContain(`all-entries passed ${entries.length} entries`)
  } finally {
    await fixture.cleanup()
  }
})
