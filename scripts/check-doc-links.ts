import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = ['README.md', 'CONTRIBUTING.md', ...markdownFiles('docs')]
const anchors = new Map<string, Set<string>>()
const failures: string[] = []

for (const file of files) {
  unfencedLines(file).forEach(function checkLine(line, index) {
    const prose = line.replace(/(`+)[^`]*?\1/g, '')
    for (const match of prose.matchAll(
      /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|^\s*\[(?!\^)[^\]]+\]:\s*(\S+)/g
    )) {
      const target = match[1] ?? match[2]
      const failure = checkLink(file, target)
      if (failure) failures.push(`${file}:${index + 1}: ${target} ${failure}`)
    }
  })
}

if (failures.length) {
  console.error(`${failures.length} broken documentation links:\n${failures.join('\n')}`)
  process.exitCode = 1
} else console.log(`${files.length} documentation files have no broken relative links or anchors.`)

function markdownFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(function entry(item) {
    const path = join(directory, item.name)
    if (item.isDirectory()) return markdownFiles(path)
    return item.name.endsWith('.md') ? [path] : []
  })
}

// Fenced code is blanked so examples are not read as links or headings.
function unfencedLines(file: string): string[] {
  let fence: string | undefined
  return readFileSync(join(root, file), 'utf8')
    .split('\n')
    .map(function prose(line) {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
      if (fence) {
        if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
        return ''
      }
      if (marker) fence = marker
      return marker ? '' : line
    })
}

function checkLink(file: string, target: string): string | undefined {
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) return undefined
  const hashIndex = target.indexOf('#')
  const path = decodeURIComponent(hashIndex === -1 ? target : target.slice(0, hashIndex))
  const fragment = hashIndex === -1 ? '' : decodeURIComponent(target.slice(hashIndex + 1))
  const destination = path ? relative(root, resolve(root, dirname(file), path)) : file
  if (destination.startsWith('..')) return 'points outside the repository'
  if (!existsSync(join(root, destination))) return `points to missing ${destination}`
  if (!fragment || !destination.endsWith('.md')) return undefined
  return headingAnchors(destination).has(fragment.toLowerCase())
    ? undefined
    : `has no #${fragment} anchor in ${destination}`
}

function headingAnchors(file: string): Set<string> {
  const cached = anchors.get(file)
  if (cached) return cached
  const found = new Set<string>()
  const counts = new Map<string, number>()
  for (const line of unfencedLines(file)) {
    for (const match of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g))
      found.add(match[1].toLowerCase())
    const heading = /^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(line)?.[1]
    if (heading === undefined) continue
    const slug = githubSlug(heading)
    const count = counts.get(slug) ?? 0
    counts.set(slug, count + 1)
    found.add(count ? `${slug}-${count}` : slug)
  }
  anchors.set(file, found)
  return found
}

// GitHub slugs the rendered heading text: lowercase, punctuation removed, spaces as hyphens.
function githubSlug(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*]|(?<!\w)_+|_+(?!\w)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-')
}
