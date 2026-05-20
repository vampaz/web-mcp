import { expect, test, type Page } from '@playwright/test'
import { invokeWebMCPTool, listWebMCPTools, waitForWebMCPTool } from '@webmcp-kit/testing/playwright'

type LanguageModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

test('uses Chrome AI context to select semantic inventory items and open records', async function testSemanticInventorySelection({ page }) {
  await installLanguageModelMock(page, 'downloadable')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'chrome-built-in')

  await getCommandTextbox(page).fill('Select all French items')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.getByText('5 selected')).toBeVisible()
  await expect(getItemInput(page, 'Croissant')).toBeChecked()
  await expect(getItemInput(page, 'Baguette')).toBeChecked()
  await expect(getItemInput(page, 'Pain au chocolat')).toBeChecked()
  await expect(getItemInput(page, 'Apple')).not.toBeChecked()

  const inventoryPromptMessages = await page.evaluate(function getPromptMessages() {
    return (window as Window & { __webMCPPromptMessages?: string[] }).__webMCPPromptMessages ?? []
  })
  expect(inventoryPromptMessages[0]).toContain('Current app context')
  expect(inventoryPromptMessages[0]).toContain('Croissant')
  expect(inventoryPromptMessages[0]).toContain('Pain au chocolat')
  expect(inventoryPromptMessages[0]).not.toContain('Stark Industries')

  await page.goto('/invoices/')
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'chrome-built-in', 'open_invoice')
  await getCommandTextbox(page).fill('Open the Stark invoice')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.locator('.active-record strong').filter({ hasText: 'Stark Industries' })).toBeVisible()

  const invoicePromptMessages = await page.evaluate(function getPromptMessages() {
    return (window as Window & { __webMCPPromptMessages?: string[] }).__webMCPPromptMessages ?? []
  })
  expect(invoicePromptMessages[0]).toContain('Current app context')
  expect(invoicePromptMessages[0]).toContain('Stark Industries')
  expect(invoicePromptMessages[0]).not.toContain('Pain au chocolat')
})

test('uses the local planner for semantic item selections when AI is unavailable', async function testFallbackItemSelection({ page }) {
  await installUnavailableLanguageModelMock(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'local')

  await getCommandTextbox(page).fill('Select all liquids')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.getByText('5 selected')).toBeVisible()
  await expect(getItemInput(page, 'Water')).toBeChecked()
  await expect(getItemInput(page, 'Coffee')).toBeChecked()
  await expect(getItemInput(page, 'Milk')).toBeChecked()
  await expect(getItemInput(page, 'Apple')).not.toBeChecked()
})

test('executes chained local invoice commands with confirmation', async function testLocalInvoiceChain({ page }) {
  await page.goto('/invoices/')
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'local', 'update_selected_invoice_status')

  page.once('dialog', async function acceptStatusConfirmation(dialog) {
    expect(dialog.message()).toContain('"status": "paid"')
    await dialog.accept()
  })

  await getCommandTextbox(page).fill('Mark Stark Industries invoices as paid')
  await page.getByRole('button', { name: 'Run' }).click()

  const starkInvoiceRow = page.getByRole('row', { name: /Stark Industries/ })
  await expect(page.getByLabel('Select Stark Industries')).toBeChecked()
  await expect(starkInvoiceRow).toContainText('paid')
})

test('rechecks Chrome AI before running a command if the page mounted with fallback', async function testPlannerRefresh({ page }) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'auto')

  await installLanguageModelInPage(page, 'available')

  await getCommandTextbox(page).fill('Select all fruits')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(getItemInput(page, 'Apple')).toBeChecked()
  await expect(getItemInput(page, 'Grapefruit')).toBeChecked()
})

test('exposes registered tools through Playwright helpers', async function testPlaywrightHelpers({ page }) {
  await installLanguageModelMock(page, 'available')
  await page.goto('/')
  await waitForWebMCPTool(page, 'select_items')

  const tools = await listWebMCPTools(page)
  expect(tools.map(function getToolName(tool) {
    return tool.name
  })).toContain('select_items')

  const result = await invokeWebMCPTool(page, {
    toolName: 'select_items',
    input: {
      ids: ['item_4', 'item_7']
    },
    source: 'planner'
  })

  expect(result.status).toBe('success')
  await expect(getItemInput(page, 'Croissant')).toBeChecked()
  await expect(getItemInput(page, 'Baguette')).toBeChecked()
})

test('plans through a selected user-key provider', async function testUserKeyProviderSelection({ page }) {
  await page.addInitScript(function storePlannerKey() {
    localStorage.setItem('webmcp-kit:openrouter:api-key', 'local-user-key')
  })
  await page.route('https://openrouter.ai/api/v1/chat/completions', async function fulfillOpenRouter(route, request) {
    expect(request.headers().authorization).toBe('Bearer local-user-key')
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                toolName: 'select_items',
                input: { ids: ['item_4', 'item_7', 'item_13', 'item_18', 'item_22'] },
                confidence: 0.94,
                reason: 'OpenRouter selected French items from current inventory context.'
              })
            }
          }
        ]
      })
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'openrouter')

  await getCommandTextbox(page).fill('Select all French items')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(getItemInput(page, 'Croissant')).toBeChecked()
  await expect(getItemInput(page, 'Quiche')).toBeChecked()
})

test('plans through the dev Cloudflare binding provider', async function testCloudflareBindingProviderSelection({ page }) {
  await page.route('**/api/webmcp/plan', async function fulfillCloudflareBinding(route, request) {
    expect(request.postDataJSON()).toMatchObject({
      provider: 'cloudflare-binding',
      model: '@cf/qwen/qwq-32b',
      message: 'Select all French items'
    })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        toolName: 'select_items',
        input: { ids: ['item_4', 'item_7', 'item_13', 'item_18', 'item_22'] },
        confidence: 0.92,
        reason: 'Cloudflare binding selected French items from current inventory context.'
      })
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'cloudflare-binding')
  await page.getByLabel('Model').selectOption('@cf/qwen/qwq-32b')
  await getCommandTextbox(page).fill('Select all French items')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(getItemInput(page, 'Croissant')).toBeChecked()
  await expect(getItemInput(page, 'Quiche')).toBeChecked()
})

test('keeps demo pages responsive without forcing cramped columns', async function testResponsiveDemoLayouts({ page }) {
  const viewports = [
    { width: 390, height: 840 },
    { width: 768, height: 900 },
    { width: 1154, height: 900 },
    { width: 1440, height: 1000 }
  ]
  const paths = ['/', '/invoices/', '/commerce/', '/support/']

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)

    for (const path of paths) {
      await page.goto(path)
      await expect(page.locator('.demo-page-header')).toBeVisible()

      const hasHorizontalOverflow = await page.evaluate(function hasHorizontalPageOverflow() {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalOverflow).toBe(false)
    }

    await page.goto('/invoices/')
    await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible()
    const invoiceLayout = await page.evaluate(function getInvoiceLayout() {
      const table = document.querySelector('.invoice-workspace')?.getBoundingClientRect()
      const detail = document.querySelector('.invoice-drawer')?.getBoundingClientRect()
      return table && detail
        ? {
            detailY: Math.round(detail.y),
            tableY: Math.round(table.y)
          }
        : undefined
    })

    expect(invoiceLayout).toBeDefined()
    if (viewport.width < 1248) {
      expect(invoiceLayout!.detailY).toBeGreaterThan(invoiceLayout!.tableY)
    } else {
      expect(invoiceLayout!.detailY).toBe(invoiceLayout!.tableY)
    }
  }

  await page.setViewportSize({ width: 1154, height: 900 })
  await page.goto('/')
  const wideTriggerBox = await getWebMCPTriggerBox(page)

  await page.setViewportSize({ width: 640, height: 900 })
  const narrowTriggerBox = await getWebMCPTriggerBox(page)

  await page.setViewportSize({ width: 1154, height: 900 })
  const regrownTriggerBox = await getWebMCPTriggerBox(page)

  expect(narrowTriggerBox.x).toBeLessThan(wideTriggerBox.x)
  expect(Math.abs(regrownTriggerBox.x - wideTriggerBox.x)).toBeLessThanOrEqual(2)
})

async function installLanguageModelMock(page: Page, availability: LanguageModelAvailability) {
  await page.addInitScript({
    content: `(${installLanguageModel.toString()})(window, ${JSON.stringify(availability)})`
  })
}

async function installLanguageModelInPage(page: Page, availability: LanguageModelAvailability) {
  await page.evaluate(function mockLanguageModel(options) {
    const install = new Function(`return (${options.source})`)() as (targetWindow: Window, mockAvailability: LanguageModelAvailability) => void
    install(window, options.availability)
  }, {
    availability,
    source: installLanguageModel.toString()
  })
}

async function installUnavailableLanguageModelMock(page: Page) {
  await page.addInitScript(function mockUnavailableLanguageModel() {
    ;(window as Window & { LanguageModel?: unknown }).LanguageModel = {
      availability: async function getAvailability() {
        return 'unavailable'
      },
      create: async function createSession() {
        throw new Error('unavailable')
      }
    }
  })
}

async function selectPlannerProvider(page: Page, provider: string, toolName = 'select_items') {
  await waitForWebMCPTool(page, toolName)
  await openWebMCPInput(page)

  const providerSelect = page.getByLabel('Provider')
  if (!(await providerSelect.isVisible())) {
    await page.getByText('Options').click()
  }

  await providerSelect.selectOption(provider)
  await expect(providerSelect).toHaveValue(provider)
}

async function openWebMCPInput(page: Page) {
  const launcher = page.getByRole('button', { name: 'Open WebMCP command input' })
  if (await launcher.getAttribute('aria-expanded') !== 'true') {
    await launcher.click()
  }
}

function getItemInput(page: Page, itemName: string) {
  return page.getByLabel(`Select ${itemName}`)
}

function getCommandTextbox(page: Page) {
  return page.getByRole('textbox', { name: 'WebMCP' })
}

async function getWebMCPTriggerBox(page: Page) {
  const launcher = page.getByRole('button', { name: 'Open WebMCP command input' })
  await expect(launcher).toBeVisible()
  const box = await launcher.boundingBox()
  if (!box) throw new Error('Expected WebMCP launcher bounds.')
  return box
}

function installLanguageModel(targetWindow: Window, mockAvailability: LanguageModelAvailability) {
  const browserWindow = targetWindow as Window & {
    LanguageModel?: unknown
    __webMCPPromptMessages?: string[]
  }

  browserWindow.__webMCPPromptMessages = []
  browserWindow.LanguageModel = {
    availability: async function getAvailability() {
      return mockAvailability
    },
    create: async function createSession() {
      return {
        prompt: async function planFromPrompt(message: string) {
          browserWindow.__webMCPPromptMessages?.push(message)
          const request = message.match(/User request: ([\s\S]*?)\n\nCurrent app context/)?.[1] ?? message

          if (request.includes('Stark')) {
            return JSON.stringify({
              toolName: 'open_invoice',
              input: { id: 'inv_104' },
              confidence: 0.91,
              reason: 'Opened the matching invoice row.'
            })
          }

          if (request.includes('French')) {
            return JSON.stringify({
              toolName: 'select_items',
              input: { ids: ['item_4', 'item_7', 'item_13', 'item_18', 'item_22'] },
              confidence: 0.94,
              reason: 'Selected French items from current inventory context.'
            })
          }

          if (request.includes('fruits')) {
            return JSON.stringify({
              toolName: 'select_items',
              input: { ids: ['item_1', 'item_2', 'item_5', 'item_11', 'item_19'] },
              confidence: 0.94,
              reason: 'Selected fruits from current inventory context.'
            })
          }

          return JSON.stringify({
            toolName: 'search_products',
            input: { query: 'dock' },
            confidence: 0.6,
            reason: 'Default mock response.'
          })
        }
      }
    }
  }
}
