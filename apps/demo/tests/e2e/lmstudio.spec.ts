import { expect, test } from '@playwright/test'
import { loadEnv } from 'vite'
import { createResolver, type WebMCPTool } from '@vampaz/webmcp-kit'
import { resolveDemoConfig } from '@/config'

test('fills arguments whose meaning only the input schema descriptions state', async function described() {
  const config = resolveDemoConfig({
    ...loadEnv('development', new URL('../../', import.meta.url).pathname, ''),
    ...process.env
  })
  const resolver = await createResolver({
    provider: 'openai-compatible',
    baseUrl: config.baseUrl,
    model: config.modelId,
    responseFormat: 'json_schema',
    maxTokens: 1024,
    temperature: 0.2,
    reasoningEffort: 'none',
    auth: config.token ? { mode: 'user-key', apiKey: config.token } : { mode: 'none' }
  })
  const tool: WebMCPTool = {
    name: 'create_invoice',
    description: 'Create an invoice.',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: "The customer's account number (accountNo) from context, not their id."
        },
        amount: { type: 'integer', description: 'Total amount in euro cents.' },
        priority: {
          type: 'integer',
          enum: [1, 2, 3],
          description: '1 is the lowest priority and 3 is the most urgent.'
        }
      },
      required: ['account', 'amount', 'priority'],
      additionalProperties: false
    },
    execute() {
      throw new Error('This model check never executes tools.')
    }
  }
  // LM Studio applies response_format as an output constraint only; the model reads descriptions in the prompt.
  const resolution = await resolver.resolve(
    'Create an urgent invoice for Acme for 250 euros.',
    [tool],
    { customers: [{ id: 'cus_17', accountNo: 'ACC-4410', name: 'Acme' }] },
    { singleStep: true }
  )
  expect(resolution).toMatchObject({
    toolName: 'create_invoice',
    input: { account: 'ACC-4410', amount: 25000, priority: 3 }
  })
})

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
  await expect(page.locator('webmcp-chat ol[aria-busy="false"]')).toHaveCount(1)
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('')
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
  await expect(page.locator('webmcp-chat ol[aria-busy="false"]')).toHaveCount(1)
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('')
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
