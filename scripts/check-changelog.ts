import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

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

const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const heading = new RegExp(
  `^##[ \\t]+${escapedVersion}(?:[ \\t]+—[ \\t]+\\d{4}-\\d{2}-\\d{2})?[ \\t]*$`,
  'm'
)
if (!heading.test(changelog)) {
  console.error(`CHANGELOG.md needs a "## ${version}" heading for the package version.`)
  process.exit(1)
}

console.log(`CHANGELOG.md has a heading for ${version}.`)
