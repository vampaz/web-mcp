import { join } from 'node:path'
import { expect, it } from 'vitest'
import { artifact, root, run, verifyArtifact } from './fixtures'

it('lints the packed artifact with publint and attw', async function artifactLint() {
  await verifyArtifact()
  const options = { cwd: root, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }

  const publint = await run(
    join(root, 'node_modules/.bin/publint'),
    ['run', '--strict', artifact],
    options
  )
  expect(publint.stdout).toContain('All good!')

  // The package is ESM-only; this profile deliberately ignores CJS/node10 resolutions.
  await run(
    join(root, 'node_modules/.bin/attw'),
    ['--profile', 'esm-only', '--no-emoji', '--no-color', artifact],
    options
  )
})
