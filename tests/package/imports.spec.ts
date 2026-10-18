import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import localTls, { resolveLocalTlsUrl } from '@vampaz/vite-plugin-local-tls'
import { artifact, checkTypes, installFixture, run, verifyArtifact } from './fixtures'
import '../../scripts/playwright-trust'

it('keeps the tarball limited to published code and documentation', async function contents() {
  await verifyArtifact()
  const { stdout } = await run('tar', ['-tzf', artifact])
  expect(stdout).not.toMatch(/package\/(apps|tests|temp-docs|scripts)\//)
  expect(stdout).not.toMatch(/\.env|\.spec\.|test-utils/)
  expect(stdout).toContain('package/dist/pi/worker.js')
  const { stdout: raw } = await run('tar', ['-xOf', artifact, 'package/package.json'])
  const manifest = JSON.parse(raw)
  expect(Object.keys(manifest.dependencies).sort()).toEqual([
    '@earendil-works/chord',
    '@earendil-works/pi-ai',
    '@earendil-works/pi-durable'
  ])
  expect(Object.keys(manifest.peerDependencies).sort()).toEqual(['react', 'svelte', 'vue', 'zod'])
})

it.each(['core-only', 'chat-only'])(
  '%s resolves declarations and runs without framework peers',
  async function imports(name) {
    const fixture = await installFixture(name)
    try {
      await checkTypes(fixture.directory)
      const { stdout } = await run(process.execPath, ['check.mjs'], { cwd: fixture.directory })
      expect(stdout).toContain('passed')
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
