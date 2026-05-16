import { expect, test, type Page } from '@playwright/test'
import { invokeWebMCPTool, listWebMCPTools, waitForWebMCPTool } from '@webmcp-kit/testing/playwright'

type LanguageModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

test('uses Chrome AI context to select and open invoice rows', async function testInvoiceSelection({ page }) {
  await installLanguageModelMock(page, 'downloadable')
  await page.goto('/')
  await page.waitForSelector('text=Invoice operations')
  await selectPlannerProvider(page, 'chrome-built-in')

  await expect(page.locator('.status-strip strong').filter({ hasText: 'Chrome built-in AI (downloadable)' })).toBeVisible()

  await page.getByLabel('Natural language command').fill('Select overdue invoices')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.getByText('2 selected')).toBeVisible()
  await expect(getInvoiceInput(page, 'Northwind')).toBeChecked()
  await expect(getInvoiceInput(page, 'Stark Industries')).toBeChecked()
  await expect(getInvoiceInput(page, 'Initech')).not.toBeChecked()

  await page.getByLabel('Natural language command').fill('Open the Stark invoice')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.locator('.result-main strong').filter({ hasText: 'Invoice opened' })).toBeVisible()
  await expect(page.locator('.active-record strong').filter({ hasText: 'Stark Industries' })).toBeVisible()

  const promptMessages = await page.evaluate(function getPromptMessages() {
    return (window as Window & { __webMCPPromptMessages?: string[] }).__webMCPPromptMessages ?? []
  })

  expect(promptMessages[0]).toContain('Current app context')
  expect(promptMessages[0]).toContain('Northwind')
  expect(promptMessages[0]).toContain('Stark Industries')
})

test('uses the local planner for invoice table selections when AI is unavailable', async function testFallbackInvoiceSelection({ page }) {
  await installUnavailableLanguageModelMock(page)
  await page.goto('/')
  await page.waitForSelector('text=Invoice operations')
  await selectPlannerProvider(page, 'local')

  await expect(page.locator('.status-strip strong').filter({ hasText: 'Local heuristic planner (fallback)' })).toBeVisible()

  await page.getByLabel('Natural language command').fill('Select unpaid invoices over 500')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.getByText('6 selected')).toBeVisible()
  await expect(page.locator('.result-main strong').filter({ hasText: 'Invoices selected' })).toBeVisible()
  await expect(getInvoiceInput(page, 'Initech')).not.toBeChecked()
  await expect(getInvoiceInput(page, 'Globex')).not.toBeChecked()
})

test('rechecks Chrome AI before running a command if the page mounted with fallback', async function testPlannerRefresh({ page }) {
  await page.goto('/')
  await page.waitForSelector('text=Invoice operations')
  await selectPlannerProvider(page, 'auto')

  await expect(page.locator('.status-strip strong').filter({ hasText: 'Local heuristic planner (fallback)' })).toBeVisible()
  await installLanguageModelInPage(page, 'available')

  await page.getByLabel('Natural language command').fill('Select overdue invoices')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.locator('.status-strip strong').filter({ hasText: 'Chrome built-in AI (ready)' })).toBeVisible()
  await expect(getInvoiceInput(page, 'Northwind')).toBeChecked()
  await expect(getInvoiceInput(page, 'Stark Industries')).toBeChecked()
})

test('exposes registered tools through Playwright helpers', async function testPlaywrightHelpers({ page }) {
  await installLanguageModelMock(page, 'available')
  await page.goto('/')
  await waitForWebMCPTool(page, 'select_invoices')

  const tools = await listWebMCPTools(page)
  expect(tools.map(function getToolName(tool) {
    return tool.name
  })).toContain('select_invoices')

  const result = await invokeWebMCPTool(page, {
    toolName: 'select_invoices',
    input: {
      ids: ['inv_101', 'inv_104']
    },
    source: 'planner'
  })

  expect(result.status).toBe('success')
  await expect(getInvoiceInput(page, 'Northwind')).toBeChecked()
  await expect(getInvoiceInput(page, 'Stark Industries')).toBeChecked()
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
                toolName: 'select_invoices',
                input: { ids: ['inv_101', 'inv_104'] },
                confidence: 0.94,
                reason: 'OpenRouter selected overdue invoices from current invoice context.'
              })
            }
          }
        ]
      })
    })
  })

  await page.goto('/')
  await page.waitForSelector('text=Invoice operations')
  await selectPlannerProvider(page, 'openrouter')

  await page.getByLabel('Natural language command').fill('Select overdue invoices')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.locator('.status-strip strong').filter({ hasText: 'OpenRouter (ready)' })).toBeVisible()
  await expect(getInvoiceInput(page, 'Northwind')).toBeChecked()
  await expect(getInvoiceInput(page, 'Stark Industries')).toBeChecked()
})

test('plans through the dev Cloudflare binding provider', async function testCloudflareBindingProviderSelection({ page }) {
  await page.route('**/api/webmcp/plan', async function fulfillCloudflareBinding(route, request) {
    expect(request.postDataJSON()).toMatchObject({
      provider: 'cloudflare-binding',
      model: '@cf/qwen/qwq-32b',
      message: 'Select overdue invoices'
    })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        toolName: 'select_invoices',
        input: { ids: ['inv_101', 'inv_104'] },
        confidence: 0.92,
        reason: 'Cloudflare binding selected overdue invoices from current invoice context.'
      })
    })
  })

  await page.goto('/')
  await page.waitForSelector('text=Invoice operations')
  await selectPlannerProvider(page, 'cloudflare-binding')
  await page.getByLabel('Model').selectOption('@cf/qwen/qwq-32b')
  await page.getByLabel('Natural language command').fill('Select overdue invoices')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.locator('.status-strip strong').filter({ hasText: 'Cloudflare binding (ready)' })).toBeVisible()
  await expect(getInvoiceInput(page, 'Northwind')).toBeChecked()
  await expect(getInvoiceInput(page, 'Stark Industries')).toBeChecked()
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

async function selectPlannerProvider(page: Page, provider: string) {
  const settings = page.locator('.palette-settings')
  if (!(await settings.evaluate(function isOpen(element) {
    return (element as HTMLDetailsElement).open
  }))) {
    await settings.locator('summary').click()
  }
  await page.getByLabel('Provider').selectOption(provider)
}

function getInvoiceInput(page: Page, customerName: string) {
  return page.getByLabel(`Select ${customerName}`)
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

          if (request.includes('overdue')) {
            return JSON.stringify({
              toolName: 'select_invoices',
              input: { ids: ['inv_101', 'inv_104'] },
              confidence: 0.94,
              reason: 'Selected overdue invoices from current invoice context.'
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
