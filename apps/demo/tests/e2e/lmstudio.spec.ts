import { expect, test } from '@playwright/test'

test('answers and discovers tools through the actual model and Pi loop', async function discovery({
  page
}) {
  await page.goto('/?mode=chat')
  await expect(page.locator('#model-status')).toContainText('LM Studio')
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill(
    'Name the two available application tools, without calling either tool. Explain briefly what each does.'
  )
  await input.press('Enter')
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('Ready')
  const assistant = page.locator('webmcp-chat li[data-role=assistant]')
  await expect(assistant).toContainText('read_counter')
  await expect(assistant).toContainText('set_counter')
  await expect(page.locator('webmcp-chat details')).toHaveCount(0)
})

test('popup reads, confirms a result-dependent write, re-resolves, and restores without replay', async function actions({
  page
}) {
  await page.goto('/?mode=chat&presentation=popup')
  await page.getByRole('button', { name: 'Open Assistant', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill(
    'First read the counter using read_counter. Then set it to the value returned by that tool plus 7. Finally use read_counter again and tell me the actual final value.'
  )
  await input.press('Enter')
  await expect(
    page.getByRole('dialog', { name: 'Approve application action', exact: true })
  ).toBeVisible()
  await expect(page.locator('webmcp-chat summary').first()).toHaveText('read_counter')
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('Ready')
  await expect(page.locator('#counter')).toHaveText('7')
  await expect(
    page.locator('webmcp-chat summary').filter({ hasText: /^read_counter$/ })
  ).toHaveCount(2)
  await expect(page.locator('webmcp-chat li[data-role=assistant]').last()).toContainText('7')
  await page.reload()
  await page.getByRole('button', { name: 'Open Assistant', exact: true }).click()
  await expect(page.locator('webmcp-chat li[data-role=assistant]').last()).toContainText('7')
  await expect(page.locator('#counter')).toHaveText('0')
  await expect(
    page.getByRole('dialog', { name: 'Approve application action', exact: true })
  ).not.toBeVisible()
})

test('denial ends the model turn before another round', async function denied({ page }) {
  let rounds = 0
  page.on('request', function round(request) {
    if (request.url().endsWith('/chat/completions')) rounds++
  })
  await page.goto('/?mode=chat')
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Set the counter to 9.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: 'Deny', exact: true }).click()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText(
    'Change the application counter?'
  )
  await expect(page.locator('#counter')).toHaveText('0')
  expect(rounds).toBe(1)
})

test('stops real inference and reload never resumes the cancelled request', async function cancelled({
  page
}) {
  let rounds = 0
  page.on('request', function round(request) {
    if (request.url().endsWith('/chat/completions')) rounds++
  })
  await page.goto('/?mode=chat')
  const request = page.waitForRequest(function inference(request) {
    return request.url().endsWith('/chat/completions')
  })
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Read the counter, then explain the result.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await request
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText('interrupted')
  await page.reload()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText('interrupted')
  await expect(
    page.locator('webmcp-chat').getByRole('button', { name: 'Stop', exact: true })
  ).not.toBeVisible()
  await expect(page.locator('#counter')).toHaveText('0')
  expect(rounds).toBe(1)
})

test('headless mode consumes the same model configuration without the reusable chat', async function headless({
  page
}) {
  const requests: string[] = []
  page.on('request', function record(request) {
    requests.push(request.url())
  })
  await page.goto('/?mode=harness')
  await page
    .getByLabel('Message', { exact: true })
    .fill('Read the current counter using read_counter and report its value.')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect
    .poll(async function terminal() {
      return JSON.parse((await page.locator('#harness-snapshot').textContent()) ?? '{}').state
    })
    .not.toMatch(/loading|running|stopping/)
  const snapshot = JSON.parse((await page.locator('#harness-snapshot').textContent()) ?? '{}')
  expect(snapshot.state).toBe('idle')
  expect(
    snapshot.messages.some(function tool(message: { role: string }) {
      return message.role === 'tool'
    })
  ).toBe(true)
  expect(
    requests.some(function chat(url) {
      return url.includes('/packages/chat/')
    })
  ).toBe(false)
})
