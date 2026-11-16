import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import localTls, { resolveLocalTlsUrl } from '@vampaz/vite-plugin-local-tls'
import { artifact, checkTypes, installFixture, run, verifyArtifact } from './fixtures'
import '../../scripts/playwright-trust'

it('includes a self-contained CDN module without bare imports', async function cdnBundle() {
  await verifyArtifact()
  const { stdout: listing } = await run('tar', ['-tzf', artifact])
  const cdnFiles = listing
    .split('\n')
    .filter(function cdnFile(path) {
      return path.startsWith('package/dist/cdn/') && path.endsWith('.js')
    })
    .sort()
  expect(cdnFiles).toEqual(['package/dist/cdn/webmcp-kit.js'])

  const { stdout: code } = await run('tar', ['-xOf', artifact, 'package/dist/cdn/webmcp-kit.js'])
  const specifiers = Array.from(
    code.matchAll(
      /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g
    ),
    function specifier(match) {
      return match[1] ?? match[2] ?? match[3]
    }
  )
  expect(specifiers).toEqual([])
})

it('does not set the duplicate-copy marker in a packed production import', async function productionMarker() {
  const fixture = await installFixture('core-only')
  try {
    const { stdout } = await run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          const marker = Symbol.for('@vampaz/webmcp-kit/registry')
          const kit = await import('@vampaz/webmcp-kit')
          kit.registerTool({
            name: 'production_marker_tool',
            description: 'A tool used to load the production registry.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            execute() { return 1 }
          })
          if (globalThis[marker] !== undefined) {
            console.error('production marker present')
            process.exit(1)
          }
          console.log('production marker absent')
        `
      ],
      {
        cwd: fixture.directory,
        env: { ...process.env, NODE_ENV: 'production' }
      }
    )
    expect(stdout).toContain('production marker absent')
  } finally {
    await fixture.cleanup()
  }
})

it('keeps the tarball limited to published code and documentation', async function contents() {
  await verifyArtifact()
  const { stdout } = await run('tar', ['-tzf', artifact])
  expect(stdout).not.toMatch(/package\/(apps|tests|temp-docs|scripts)\//)
  expect(stdout).not.toMatch(/\.env|\.spec\.|test-utils/)
  expect(stdout).not.toContain('package/dist/pi/worker.js')
  expect(stdout).not.toMatch(/package\/docs\/next-features\.md/)
  expect(stdout).toContain('package/docs/examples/counter-assistant.ts')
  const { stdout: sourceMap } = await run('tar', ['-xOf', artifact, 'package/dist/index.js.map'])
  expect(JSON.parse(sourceMap).sourcesContent).toBeUndefined()
  const { stdout: raw } = await run('tar', ['-xOf', artifact, 'package/package.json'])
  const manifest = JSON.parse(raw)
  expect(manifest.dependencies ?? {}).toEqual({})
  expect(stdout).toContain('package/dist/THIRD-PARTY-NOTICES.md')
  expect(Object.keys(manifest.peerDependencies).sort()).toEqual(['react', 'svelte', 'vue', 'zod'])
})

it.each(['core-only', 'chat-only'])(
  '%s resolves declarations and runs without framework peers',
  async function imports(name) {
    const fixture = await installFixture(name)
    try {
      await checkTypes(fixture.directory)
      await checkTypes(fixture.directory, 'tsconfig.nodenext.json')
      const { stdout } = await run(process.execPath, ['check.mjs'], { cwd: fixture.directory })
      expect(stdout).toContain('passed')
      if (name === 'core-only') {
        const { stdout: server } = await run(process.execPath, ['server-check.mjs'], {
          cwd: fixture.directory
        })
        expect(server).toContain('server passed')
      }
      const manifest = JSON.parse(await readFile(join(fixture.directory, 'package.json'), 'utf8'))
      expect(manifest.dependencies).toBeUndefined()
      if (name === 'chat-only') {
        const tls = { domain: 'webmcp-kit-package-imports.localtest.me' }
        const url = resolveLocalTlsUrl(tls)!
        const server = await createServer({
          configFile: false,
          plugins: [localTls(tls)],
          root: fixture.directory,
          server: { host: '127.0.0.1', port: 0, allowedHosts: [new URL(url).hostname] },
          logLevel: 'error'
        })
        const browser = await chromium.launch()
        try {
          await server.listen()
          await expect
            .poll(async function ready() {
              try {
                return (await fetch(url)).status
              } catch {
                return 0
              }
            })
            .toBe(200)
          const page = await browser.newPage()
          await page.goto(url)
          expect(
            await page.evaluate(function secure() {
              return location.protocol === 'https:' && isSecureContext
            })
          ).toBe(true)
          await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello')
          await page.getByRole('button', { name: 'Send', exact: true }).click()
          await page.getByText('Fake controller response', { exact: true }).waitFor()
        } finally {
          await browser.close()
          await server.close()
        }
      }
    } finally {
      await fixture.cleanup()
    }
  }
)
