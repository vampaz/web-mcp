import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, readdir, mkdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

export async function sourceDigest(root: string): Promise<string> {
  const files = [
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'source-aliases.ts',
    'tsconfig.base.json',
    'tsconfig.json',
    'README.md',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'licenses/pi-MIT.txt'
  ]
  async function walk(directory: string) {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory() && entry.name !== 'test-utils' && entry.name !== '__snapshots__')
        await walk(path)
      else if (
        entry.isFile() &&
        ((directory.startsWith('docs') && path.endsWith('.md')) ||
          (path.endsWith('.ts') && !path.endsWith('.spec.ts')))
      )
        files.push(path)
    }
  }
  await walk('packages')
  await walk('docs')
  const hash = createHash('sha256')
  for (const file of files.sort()) {
    const content = await readFile(join(root, file))
    hash.update(file + '\0' + content.length + '\0')
    hash.update(content)
  }
  return hash.digest('hex')
}

async function pack() {
  const digest = await sourceDigest(process.cwd())
  let built: { sourceDigest: string }
  try {
    built = JSON.parse(await readFile('dist/build.json', 'utf8'))
  } catch {
    throw new Error('A fresh authorized packaging build is required before packing.')
  }
  if (built.sourceDigest !== digest)
    throw new Error('dist is stale. Produce a fresh authorized packaging build before packing.')
  await mkdir('artifacts', { recursive: true })
  const { stdout } = await promisify(execFile)('npm', [
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    'artifacts'
  ])
  const result = Object.values(JSON.parse(stdout))[0] as { filename: string }
  await rename(join('artifacts', result.filename), 'artifacts/webmcp-kit.tgz')
  if (digest !== (await sourceDigest(process.cwd())))
    throw new Error('Sources changed during packing. Produce a fresh artifact.')
  await writeFile(
    'artifacts/webmcp-kit.json',
    JSON.stringify(
      {
        sourceDigest: digest,
        sha256: createHash('sha256')
          .update(await readFile('artifacts/webmcp-kit.tgz'))
          .digest('hex')
      },
      null,
      2
    ) + '\n'
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await pack()
