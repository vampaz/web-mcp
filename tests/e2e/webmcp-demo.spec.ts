import { expect, test, type Page } from '@playwright/test'
import { invokeWebMCPTool, listWebMCPTools, waitForWebMCPTool } from '@webmcp-kit/testing/playwright'

type LanguageModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

test('uses Chrome AI context to select semantic checklist items', async function testSemanticChecklistSelection({ page }) {
  await installLanguageModelMock(page, 'downloadable')
  await page.goto('/')
  await page.waitForSelector('text=Ten-item checklist')

  await expect(page.getByText('Chrome built-in AI (downloadable)')).toBeVisible()

  await page.getByLabel('Natural language command').fill('Select all the items that are French food.')
  await page.getByRole('button', { name: 'Run command' }).click()

  await expect(page.getByText('2 selected')).toBeVisible()
  await expect(getChecklistInput(page, '4. Croissant')).toBeChecked()
  await expect(getChecklistInput(page, '7. Baguette')).toBeChecked()
  await expect(getChecklistInput(page, '3. Carrot')).not.toBeChecked()

  await page.getByLabel('Natural language command').fill('Select all the ones that are roots')
  await page.getByRole('button', { name: 'Run command' }).click()

  await expect(page.getByText('2 selected')).toBeVisible()
  await expect(getChecklistInput(page, '3. Carrot')).toBeChecked()
  await expect(getChecklistInput(page, '9. Beetroot')).toBeChecked()
  await expect(getChecklistInput(page, '4. Croissant')).not.toBeChecked()

  const promptMessages = await page.evaluate(function getPromptMessages() {
    return (window as Window & { __webMCPPromptMessages?: string[] }).__webMCPPromptMessages ?? []
  })

  expect(promptMessages[0]).toContain('Current app context')
  expect(promptMessages[0]).toContain('Croissant')
  expect(promptMessages[0]).toContain('Baguette')
})

test('does not turn semantic checklist selection into product search when AI is unavailable', async function testFallbackSemanticSelection({ page }) {
  await installUnavailableLanguageModelMock(page)
  await page.goto('/')
  await page.waitForSelector('text=Ten-item checklist')

  await expect(page.getByText('Local heuristic planner (fallback)')).toBeVisible()

  await page.getByLabel('Natural language command').fill('Select all the items that are French food.')
  await page.getByRole('button', { name: 'Run command' }).click()

  await expect(page.getByText('Selected tool')).toBeVisible()
  await expect(page.locator('.plan-card strong').filter({ hasText: 'select_items' })).toBeVisible()
  await expect(page.getByText('Fallback planner cannot infer semantic checklist selection')).toBeVisible()
  await expect(page.getByText('Products searched')).not.toBeVisible()
  await expect(getChecklistInput(page, '4. Croissant')).not.toBeChecked()
  await expect(getChecklistInput(page, '7. Baguette')).not.toBeChecked()
})

test('rechecks Chrome AI before running a command if the page mounted with fallback', async function testPlannerRefresh({ page }) {
  await page.goto('/')
  await page.waitForSelector('text=Ten-item checklist')

  await expect(page.getByText('Local heuristic planner (fallback)')).toBeVisible()
  await installLanguageModelInPage(page, 'available')

  await page.getByLabel('Natural language command').fill('Select all the items that are French food.')
  await page.getByRole('button', { name: 'Run command' }).click()

  await expect(page.locator('.status-strip strong').filter({ hasText: 'Chrome built-in AI (ready)' })).toBeVisible()
  await expect(getChecklistInput(page, '4. Croissant')).toBeChecked()
  await expect(getChecklistInput(page, '7. Baguette')).toBeChecked()
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
  await expect(getChecklistInput(page, '4. Croissant')).toBeChecked()
  await expect(getChecklistInput(page, '7. Baguette')).toBeChecked()
})

async function installLanguageModelMock(page: Page, availability: LanguageModelAvailability) {
  await page.addInitScript(function mockLanguageModel(mockAvailability) {
    const browserWindow = window as Window & {
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

            if (request.includes('French')) {
              return JSON.stringify({
                toolName: 'select_items',
                input: { ids: ['item_4', 'item_7'] },
                confidence: 0.94,
                reason: 'Selected French foods from current checklist context.'
              })
            }

            if (request.includes('roots')) {
              return JSON.stringify({
                toolName: 'select_items',
                input: { ids: ['item_3', 'item_9'] },
                confidence: 0.91,
                reason: 'Selected root foods from current checklist context.'
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
  }, availability)
}

async function installLanguageModelInPage(page: Page, availability: LanguageModelAvailability) {
  await page.evaluate(function mockLanguageModel(mockAvailability) {
    const browserWindow = window as Window & {
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

            if (request.includes('French')) {
              return JSON.stringify({
                toolName: 'select_items',
                input: { ids: ['item_4', 'item_7'] },
                confidence: 0.94,
                reason: 'Selected French foods from current checklist context.'
              })
            }

            if (request.includes('roots')) {
              return JSON.stringify({
                toolName: 'select_items',
                input: { ids: ['item_3', 'item_9'] },
                confidence: 0.91,
                reason: 'Selected root foods from current checklist context.'
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
  }, availability)
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

function getChecklistInput(page: Page, labelText: string) {
  return page.locator('.checklist-item', { hasText: labelText }).locator('input')
}
