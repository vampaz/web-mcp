import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export type ReleaseNotesResult = { notes: string } | { error: string }

/** Extracts the changelog section for a version, stopping at the next level-two heading. */
export function extractReleaseNotes(changelog: string, version: string): ReleaseNotesResult {
  if (!version.trim()) return { error: 'A version is required.' }
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(
    `^##[ \\t]+${escapedVersion}(?:[ \\t]+—[ \\t]+\\d{4}-\\d{2}-\\d{2})?[ \\t]*\\r?$`,
    'm'
  )
  const match = heading.exec(changelog)
  if (!match)
    return {
      error: `CHANGELOG.md needs a "## ${version}" heading for the package version.`
    }
  const rest = changelog.slice(match.index + match[0].length)
  const next = /^##[ \t]/m.exec(rest)
  const notes = (next ? rest.slice(0, next.index) : rest).trim()
  if (!notes) return { error: `CHANGELOG.md section for ${version} is empty.` }
  return { notes }
}

async function main(): Promise<void> {
  const [version, output] = process.argv.slice(2)
  if (!version || !output) {
    console.error('Usage: release-notes.ts <version> <output-file>')
    process.exit(1)
  }
  let changelog: string
  try {
    changelog = await readFile(join(process.cwd(), 'CHANGELOG.md'), 'utf8')
  } catch {
    console.error('Cannot read CHANGELOG.md.')
    process.exit(1)
  }
  const result = extractReleaseNotes(changelog, version)
  if ('error' in result) {
    console.error(result.error)
    process.exit(1)
  }
  await writeFile(output, `${result.notes}\n`, 'utf8')
  console.log(`Wrote release notes for ${version} to ${output}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch(function fail(error: unknown) {
    console.error(error instanceof Error ? error.message : 'Release notes extraction failed.')
    process.exit(1)
  })
