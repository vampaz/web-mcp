import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractReleaseNotes } from './release-notes.ts'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
  version?: unknown
}
if (typeof packageJson.version !== 'string' || !packageJson.version.trim()) {
  console.error('package.json must declare a version.')
  process.exit(1)
}
const version = packageJson.version
const changelogPath = process.argv[2] ?? join(root, 'CHANGELOG.md')
let changelog: string
try {
  changelog = await readFile(changelogPath, 'utf8')
} catch {
  console.error(`Cannot read ${changelogPath}.`)
  process.exit(1)
}

const result = extractReleaseNotes(changelog, version)
if ('error' in result) {
  console.error(result.error)
  process.exit(1)
}

console.log(`CHANGELOG.md has release notes for ${version}.`)
