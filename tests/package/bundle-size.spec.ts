import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { gzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { artifact, run, verifyArtifact } from './fixtures'

// Gzip bytes of each entry's chunk graph: `eager` follows static imports, `total` adds lazy chunks.
// Reviewed 0.5.0 graph sizes after the schema/approval, chat, command-input and devtools additions:
// root 22,642; chat 12,404; command-input 27,065; devtools 30,263; hosted 8,331; mcp-bridge 23,453;
// pi 25,749 eager / 144,094 total; react 23,340; svelte 23,287; testing 24,907; vue 23,348; zod 22,979.
// New ceilings add 10% rounded up to 100 bytes. Preserve existing ceilings that already fit.
// Raise a ceiling only after reviewing the artifact's size increase and import graph.
// 0.6.0 chat: 13,707 bytes with the optional settings UI; no runtime dependencies added.
// Give that reviewed graph the same 10% headroom, rounded up to 100 bytes.
// 0.8.5 chat: 15,212 bytes after adding the themed settings select chevrons; no dependencies added.
// 0.9.0 chat: 20,093 bytes with the composer model picker, grouped tool rows and refined styles;
// no dependencies added.
// 0.8.3 explicit lifecycle machines share transition/deferred chunks and add no dependencies.
// Reviewed eager bytes: root 25,467; mcp-bridge 26,280; react 26,165; svelte 26,112;
// vue 26,173; zod 25,804; pi 29,428; command-input 29,838; hosted 9,630.
// Pi total is 149,727 bytes. Raise only exceeded ceilings with the same 10% policy above.
const budgets: Record<string, { eager: number; total: number }> = {
  '.': { eager: 28_100, total: 28_100 },
  './chat': { eager: 22_200, total: 22_200 },
  './command-input': { eager: 32_900, total: 32_900 },
  './devtools': { eager: 33_300, total: 33_300 },
  './hosted': { eager: 10_600, total: 10_600 },
  './mcp-bridge': { eager: 29_000, total: 29_000 },
  './pi': { eager: 32_400, total: 152_300 },
  './react': { eager: 28_800, total: 28_800 },
  './svelte': { eager: 28_800, total: 28_800 },
  // 0.8.0 shares the native runner through the Playwright helper entry: 27,418 bytes.
  './testing': { eager: 30_200, total: 30_200 },
  // 0.8.0 native journey runner adds shared resolution/schema validation: 25,596 bytes.
  // This Node-side testing entry has no effect on application entry budgets.
  './testing/playwright': { eager: 28_200, total: 28_200 },
  './vue': { eager: 28_800, total: 28_800 },
  './zod': { eager: 28_400, total: 28_400 }
}

it('keeps each entry chunk graph within its gzip budget', async function bundleSize() {
  await verifyArtifact()
  const directory = await mkdtemp(join(tmpdir(), 'webmcp-bundle-size-'))
  try {
    await run('tar', ['-xzf', artifact, '-C', directory])
    const root = join(directory, 'package')
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      name: string
      exports: Record<string, string | { default: string }>
    }
    const files = new Map<string, string>()
    for (const [path, value] of Object.entries(manifest.exports))
      if (typeof value !== 'string') files.set(path, posix.normalize(value.default))
    const sizes = new Map<string, number>()
    const imports = new Map<string, { eager: string[]; lazy: string[] }>()

    async function chunkImports(file: string) {
      const cached = imports.get(file)
      if (cached) return cached
      const code = await readFile(join(root, file), 'utf8')
      sizes.set(file, gzipSync(code).length)
      const found = { eager: [] as string[], lazy: [] as string[] }
      for (const match of code.matchAll(/\b(from\s*|import\s*\(\s*|import\s*)(['"])([^'"]+)\2/g)) {
        const specifier = match[3]
        const target =
          specifier.startsWith('./') || specifier.startsWith('../')
            ? posix.join(posix.dirname(file), specifier)
            : specifier === manifest.name || specifier.startsWith(`${manifest.name}/`)
              ? files.get(`.${specifier.slice(manifest.name.length)}`)
              : undefined
        if (target) (match[1].includes('(') ? found.lazy : found.eager).push(target)
      }
      imports.set(file, found)
      return found
    }

    async function graphSize(entry: string, lazy: boolean) {
      const seen = new Set<string>()
      const pending = [entry]
      while (pending.length) {
        const file = pending.pop()!
        if (seen.has(file)) continue
        seen.add(file)
        const found = await chunkImports(file)
        pending.push(...found.eager, ...(lazy ? found.lazy : []))
      }
      let total = 0
      for (const file of seen) total += sizes.get(file)!
      return total
    }

    const measured: Record<string, { eager: number; total: number }> = {}
    for (const [path, file] of files)
      measured[path] = { eager: await graphSize(file, false), total: await graphSize(file, true) }
    expect(Object.keys(measured).sort()).toEqual(Object.keys(budgets).sort())
    const exceeded = Object.entries(measured).flatMap(function overBudget([path, size]) {
      const budget = budgets[path]
      return size.eager > budget.eager || size.total > budget.total
        ? [`${path}: eager ${size.eager}/${budget.eager}, total ${size.total}/${budget.total}`]
        : []
    })
    expect(exceeded).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
