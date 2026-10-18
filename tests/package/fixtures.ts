import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { sourceDigest } from '../../scripts/package-artifact'

export const root = resolve(import.meta.dirname, '../..')
export const artifact = resolve(
  root,
  process.env.WEBMCP_PACKAGE_TARBALL ?? 'artifacts/webmcp-kit.tgz'
)
export const run = promisify(execFile)

export async function verifyArtifact() {
  let metadata: { sourceDigest: string; sha256: string }
  try {
    metadata = JSON.parse(await readFile(artifact.replace(/\.tgz$/, '.json'), 'utf8'))
  } catch {
    throw new Error(
      'A fresh CI package artifact and metadata are required. Run the checks workflow, then supply artifacts/webmcp-kit.tgz and webmcp-kit.json. test:package never builds the library.'
    )
  }
  if (metadata.sourceDigest !== (await sourceDigest(root)))
    throw new Error(
      'Package artifact is stale for the current sources. Produce a fresh reviewed artifact.'
    )
  if (
    metadata.sha256 !==
    createHash('sha256')
      .update(await readFile(artifact))
      .digest('hex')
  )
    throw new Error('Package artifact integrity check failed.')
  const { stdout: stamp } = await run('tar', ['-xOf', artifact, 'package/dist/build.json'])
  if (JSON.parse(stamp).sourceDigest !== metadata.sourceDigest)
    throw new Error('The artifact was built from different sources.')
}

export async function installFixture(
  name: string
): Promise<{ directory: string; cleanup(): Promise<void> }> {
  await verifyArtifact()
  const directory = await mkdtemp(join(tmpdir(), `webmcp-${name}-`))
  try {
    await cp(join(root, 'tests/fixtures', name), directory, { recursive: true })
    await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: directory,
      timeout: 120000,
      maxBuffer: 1024 * 1024
    })
    await run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-save',
        '--package-lock=false',
        artifact
      ],
      { cwd: directory, timeout: 120000, maxBuffer: 1024 * 1024 }
    )
    return {
      directory,
      async cleanup() {
        await rm(directory, { recursive: true, force: true, maxRetries: 3 })
      }
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function checkTypes(directory: string, config = 'tsconfig.json') {
  await run(
    process.execPath,
    [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', join(directory, config)],
    { cwd: directory, timeout: 60000 }
  )
}
