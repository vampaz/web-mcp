import { expect, test } from '@playwright/test'

test('cached page lifecycle preserves the application tools', async function testRestore({ page }) {
  await page.goto('/?mode=core')
  await expect(page.locator('#counter')).toHaveText('0')
  await page.evaluate(function restore() {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  })
  await page.getByRole('button', { name: 'Read counter', exact: true }).click()
  await expect(page.locator('#tool-status')).toContainText('"value":0')
})

test('replacing a pending approval keeps the new request open for the user', async function testApproval({
  page
}) {
  await page.goto('/?mode=core')
  await expect(page.locator('#counter')).toHaveText('0')
  await page.evaluate(function replaceApproval() {
    const input = document.querySelector<HTMLInputElement>('#value')!
    const form = document.querySelector<HTMLFormElement>('#counter-form')!
    for (const value of ['1', '2']) {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      form.requestSubmit()
    }
  })
  await expect(page.locator('#approval-action')).toContainText('New value: 2')
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.locator('#counter')).toHaveText('2')
  await expect(page.locator('#tool-status')).toContainText('success')
})

test('core works without Pi, a model, or native WebMCP', async function testCore({ page }) {
  const imports: string[] = []
  const hmr: string[] = []
  page.on('websocket', function connected(socket) {
    if (socket.url().startsWith('wss://'))
      socket.on('framereceived', function frame(event) {
        hmr.push(String(event.payload))
      })
  })
  page.on('request', function record(request) {
    imports.push(request.url())
  })
  await page.goto('/?mode=core')
  expect(
    await page.evaluate(function origin() {
      return { protocol: location.protocol, secure: isSecureContext }
    })
  ).toEqual({ protocol: 'https:', secure: true })
  await expect
    .poll(function connected() {
      return hmr.some(function ready(frame) {
        return frame.includes('connected')
      })
    })
    .toBe(true)
  await page.getByRole('button', { name: 'Read counter', exact: true }).click()
  await expect(page.locator('#tool-status')).toContainText('"value":0')
  await page.locator('#value').fill('101')
  await page.getByRole('button', { name: 'Set value', exact: true }).click()
  await expect(page.locator('#tool-status')).toContainText('invalid_input')
  await page.locator('#value').fill('7')
  await page.getByRole('button', { name: 'Set value', exact: true }).click()
  await page.getByRole('button', { name: 'Deny', exact: true }).click()
  await expect(page.locator('#counter')).toHaveText('0')
  await expect(page.locator('#tool-status')).toContainText('confirmation_denied')
  await page.getByRole('button', { name: 'Set value', exact: true }).click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.locator('#counter')).toHaveText('7')
  expect(
    imports.some(function runtime(url) {
      return /packages\/(pi|chat)\//.test(url)
    })
  ).toBe(false)
  await expect(page.locator('#model-status')).toHaveText('Fallback registry active')
})
