import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import localTls from '@vampaz/vite-plugin-local-tls'
import { installFixture, root, run } from './fixtures'
import '../../scripts/playwright-trust'

it('runs a packed Vite + Vue consumer under a nested path and one page registry', async function piConsumer() {
  const fixture = await installFixture('pi-chat')
  const browser = await chromium.launch({ args: ['--disable-blink-features=WebMCP'] })
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    await cp(
      join(fixture.directory, 'node_modules/@vampaz/webmcp-kit/docs/examples/counter-assistant.ts'),
      join(fixture.directory, 'counter-assistant.ts')
    )
    await run(
      process.execPath,
      [
        join(root, 'node_modules/vue-tsc/bin/vue-tsc.js'),
        '--noEmit',
        '-p',
        join(fixture.directory, 'tsconfig.json')
      ],
      { cwd: fixture.directory, timeout: 60000 }
    )
    server = await createServer({
      configFile: false,
      plugins: [vue(), localTls({ domain: 'webmcp-kit-package.localtest.me' })],
      root: fixture.directory,
      base: '/nested/',
      server: { host: '127.0.0.1', port: 0, allowedHosts: ['webmcp-kit-package.localtest.me'] },
      preview: { host: '127.0.0.1' },
      logLevel: 'error'
    })
    await server.listen()
    const url = 'https://webmcp-kit-package.localtest.me/nested/'
    await expect
      .poll(
        async function ready() {
          try {
            return (await fetch(url)).status
          } catch {
            return 0
          }
        },
        { timeout: 10000 }
      )
      .toBe(200)
    const page = await browser.newPage()
    await page.goto(url)
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Read')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.getByText('Packed Pi read 7', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Use popup', exact: true }).click()
    await page.getByRole('button', { name: 'Open Assistant', exact: true }).click()
    expect(await page.getByRole('dialog', { name: 'Assistant', exact: true }).isVisible()).toBe(
      true
    )
    expect(await page.getByText('Packed Pi read 7', { exact: true }).isVisible()).toBe(true)
    expect(await page.locator('#registry-count').textContent()).toBe('1')
    expect(
      await page.evaluate(async function registrations() {
        return (await navigator.serviceWorker.getRegistrations()).map(function scope(registration) {
          return new URL(registration.scope).pathname
        })
      })
    ).toEqual([])
  } finally {
    await server?.close()
    await browser.close()
    await fixture.cleanup()
  }
})
