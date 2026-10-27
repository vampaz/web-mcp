import { expect, test } from '@playwright/test'

test('selects a real provider and model and sends with that model', async function ({ page }) {
  await page.route('**/__demo-config', function config(route) {
    return route.fulfill({ json: { modelId: 'model-one', fixtures: false } })
  })
  await page.route('**/__lmstudio/api/v0/models', function models(route) {
    return route.fulfill({
      json: {
        data: [
          { id: 'model-one', type: 'llm', state: 'loaded' },
          { id: 'model-two', type: 'vlm', state: 'not-loaded' },
          { id: 'embedding-model', type: 'embeddings', state: 'loaded' }
        ]
      }
    })
  })
  const sentModels: string[] = []
  await page.route('**/__lmstudio/v1/chat/completions', function answer(route) {
    sentModels.push(route.request().postDataJSON().model)
    return route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: {
                  toolName: 'pi_reply',
                  input: { text: 'Hello from the selected model.' },
                  confidence: 1,
                  reason: 'Reply'
                }
              })
            }
          }
        ]
      }
    })
  })
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  await chat.getByRole('button', { name: 'Settings', exact: true }).click()
  const provider = chat.getByLabel('Provider', { exact: true })
  await expect(provider.locator('option')).toHaveText(['LM Studio (local)', 'Chrome built-in AI'])
  const model = chat.getByLabel('Model', { exact: true })
  await expect(model.locator('option')).toHaveText(['model-one', 'model-two'])
  await expect(model).toHaveValue('model-one')
  await model.selectOption('model-two')
  await expect(model).toBeEnabled()
  await chat.getByRole('button', { name: 'Close settings', exact: true }).click()
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('Hello')
  await input.press('Enter')
  await expect(chat.locator('li[data-role="assistant"]').last()).toContainText(
    'Hello from the selected model.'
  )
  expect(sentModels).toEqual(['model-two'])
  await page.reload()
  await chat.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(model).toHaveValue('model-two')
  await expect(chat).not.toContainText('Fault injection fixture')
})

test('keeps provider settings usable when LM Studio is unavailable', async function ({ page }) {
  await page.route('**/__demo-config', function config(route) {
    return route.fulfill({ json: { modelId: '', fixtures: false } })
  })
  await page.route('**/__lmstudio/api/v0/models', function unavailable(route) {
    return route.fulfill({ status: 502, json: { error: 'Unavailable' } })
  })
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  await chat.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(chat.locator('.settings-error')).toContainText('LM Studio')
  const provider = chat.getByLabel('Provider', { exact: true })
  await expect(provider).toBeEnabled()
  await provider.selectOption('chrome-ai')
  await expect(provider).toBeEnabled()
  await expect(chat.locator('.settings-error')).not.toContainText('LM Studio')
  await expect(provider).toHaveValue('chrome-ai')
})

test('requires a new selection when the saved model is no longer available', async function ({
  page
}) {
  await page.route('**/__demo-config', function config(route) {
    return route.fulfill({ json: { modelId: 'removed-model', fixtures: false } })
  })
  await page.route('**/__lmstudio/api/v0/models', function models(route) {
    return route.fulfill({ json: { data: [{ id: 'available-model', type: 'llm' }] } })
  })
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  await chat.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(chat.locator('.settings-error')).toContainText('removed-model is unavailable')
  await chat.getByLabel('Model', { exact: true }).selectOption('available-model')
  await expect(chat.locator('.settings-error')).toBeHidden()
  await chat.getByRole('button', { name: 'Close settings', exact: true }).click()
  await expect(chat.getByRole('textbox', { name: 'Message', exact: true })).toBeEnabled()
})

for (const presentation of ['inline', 'popup']) {
  test(`uses shared settings in the local ${presentation} demo`, async function ({ page }) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/?mode=chat&presentation=${presentation}`)
    const chat = page.locator('webmcp-chat')
    if (presentation === 'popup')
      await chat.getByRole('button', { name: 'Open Assistant', exact: true }).click()
    const input = chat.getByRole('textbox', { name: 'Message', exact: true })
    await expect(input).toBeEnabled()
    await input.fill('set 7')
    const settings = chat.getByRole('button', { name: 'Settings', exact: true })
    await settings.focus()
    await settings.press('Enter')
    await expect(chat.getByRole('region', { name: 'Settings', exact: true })).toBeVisible()
    await expect(input).toBeHidden()
    await expect(chat.getByLabel('Provider', { exact: true })).toBeVisible()
    await expect(chat.getByLabel('Presentation', { exact: true })).toHaveValue(presentation)
    await chat.getByLabel('Ask before making changes', { exact: false }).uncheck()
    await chat.getByLabel('Provider', { exact: true }).press('Escape')
    await expect(settings).toBeFocused()
    await expect(input).toHaveValue('set 7')
    await chat.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.locator('#counter')).toHaveText('7')
    await expect(
      page.getByRole('dialog', { name: 'Approve application action', exact: true })
    ).toBeHidden()
    await settings.click()
    await chat
      .getByLabel('Presentation', { exact: true })
      .selectOption(presentation === 'inline' ? 'popup' : 'inline')
    if (presentation === 'inline')
      await chat.getByRole('button', { name: 'Open Assistant', exact: true }).click()
    await expect(chat.getByRole('region', { name: 'Settings', exact: true })).toBeVisible()
    await chat.getByRole('button', { name: 'Close settings', exact: true }).click()
    await expect(input).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
