import { expect, test } from '@playwright/test'

test('headless controls run the real Pi loop through the explicit worker scope', async function headless({
  page
}) {
  await page.goto('/?mode=harness')
  await expect(page.locator('#harness-snapshot')).toContainText('"state": "idle"')
  await page.getByLabel('Message', { exact: true }).fill('read')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.locator('#harness-snapshot')).toContainText('Fixture answer')
  expect(
    await page.evaluate(async function scope() {
      const registrations = await navigator.serviceWorker.getRegistrations()
      return registrations.map(function path(registration) {
        return new URL(registration.scope).pathname
      })
    })
  ).toEqual(['/webmcp-pi/'])
  expect(
    await page.evaluate(function controlled() {
      return navigator.serviceWorker.controller
    })
  ).toBeNull()
})

test('coexists with an application root PWA worker', async function pwa({ page }) {
  await page.goto('/?mode=core')
  await page.evaluate(async function install() {
    await navigator.serviceWorker.register('/pwa-worker.js', { scope: '/' })
    await navigator.serviceWorker.ready
  })
  await page.goto('/?mode=chat')
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('Ready')
  const result = await page.evaluate(async function registrations() {
    return {
      scopes: (await navigator.serviceWorker.getRegistrations())
        .map(function scope(registration) {
          return new URL(registration.scope).pathname
        })
        .sort(),
      controller: navigator.serviceWorker.controller?.scriptURL
    }
  })
  expect(result.scopes).toEqual(['/', '/webmcp-pi/'])
  expect(result.controller).toContain('/pwa-worker.js')
})

test('stopping a pending approval closes the application dialog and never executes', async function stop({
  page
}) {
  await page.goto('/?mode=chat')
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('set 7')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // The dialog is modal. Cancel through the public controller, as a host account/navigation event does.
  await page.evaluate(async function cancel() {
    const { stopDemoHarness } = await import('/src/harness.ts')
    await stopDemoHarness()
  })
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText('interrupted')
  await expect(page.locator('#counter')).toHaveText('0')
  await page.reload()
  await expect(
    page.locator('webmcp-chat').getByRole('button', { name: 'Send', exact: true })
  ).toBeDisabled()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('#counter')).toHaveText('0')
})

test('service worker termination interrupts approval and reload does not replay', async function terminated({
  page,
  context
}) {
  await page.goto('/?mode=chat')
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('set 9')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const cdp = await context.newCDPSession(page)
  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.stopAllWorkers')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText(
    /closed|responding|interrupted/
  )
  await page.reload()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText('interrupted')
  await expect(page.locator('#counter')).toHaveText('0')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('a new user turn reconnects after an idle worker terminates', async function idleRecovery({
  page,
  context
}) {
  await page.goto('/?mode=chat')
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('read')
  await input.press('Enter')
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('Ready')
  const cdp = await context.newCDPSession(page)
  await cdp.send('ServiceWorker.enable')
  await cdp.send('ServiceWorker.stopAllWorkers')
  await input.fill('read again')
  await input.press('Enter')
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('Ready')
  await expect(page.locator('webmcp-chat summary')).toHaveCount(2)
  await expect(page.locator('#counter')).toHaveText('0')
})
