import { expect, test, type Page, type Route } from '@playwright/test'
import type { WebMCPCommandInputElement } from 'webmcp-kit'
import { invokeWebMCPTool, listWebMCPTools, waitForWebMCPTool } from 'webmcp-kit/testing/playwright'

type LanguageModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

test('uses Chrome AI context to select semantic inventory items and open records', async function testSemanticInventorySelection({
  page
}) {
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

  await expect(
    page.locator('.active-record strong').filter({ hasText: 'Stark Industries' })
  ).toBeVisible()

  const invoicePromptMessages = await page.evaluate(function getPromptMessages() {
    return (window as Window & { __webMCPPromptMessages?: string[] }).__webMCPPromptMessages ?? []
  })
  expect(invoicePromptMessages[0]).toContain('Current app context')
  expect(invoicePromptMessages[0]).toContain('Stark Industries')
  expect(invoicePromptMessages[0]).not.toContain('Pain au chocolat')
})

test('uses the local planner for semantic item selections when AI is unavailable', async function testFallbackItemSelection({
  page
}) {
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
  await expect(page.locator('.latest-plan')).toContainText('select_items')
  await expect(page.locator('.latest-plan')).toContainText('"ids"')
})

test('renders the guided demo proof points', async function testDemoGuide({ page }) {
  await page.goto('/guide/')

  await expect(
    page.getByRole('heading', {
      name: 'Natural language becomes safe, typed app actions.'
    })
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Commerce' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible()
  await expect(page.getByText('select_items({ ids: [...] })')).toBeVisible()
  await expect(page.getByText('Confirmation is enforced per mutating tool')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Inventory' })).toHaveAttribute('href', '/')
  await expect(page.getByRole('link', { name: 'Open Invoices' })).toHaveAttribute(
    'href',
    '/invoices/'
  )
  await expect(page.getByRole('link', { name: 'Open Commerce' })).toHaveAttribute(
    'href',
    '/commerce/'
  )
  await expect(page.getByRole('link', { name: 'Open Support' })).toHaveAttribute(
    'href',
    '/support/'
  )
})

test('serves the investor memo only as a direct route', async function testInvestorMemoRoute({
  page
}) {
  await page.goto('/investor-memo/')

  await expect(
    page.getByRole('heading', { name: 'Safe, typed app actions for browser agents.' })
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hosted planner tokens first' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Demo sections' }).getByRole('link', {
      name: 'Investor memo'
    })
  ).toHaveCount(0)

  const robots = await page.locator('meta[name="robots"]').getAttribute('content')
  expect(robots).toBe('noindex,nofollow')
})

test('shows browser local AI as a selectable demo provider', async function testBrowserLocalProviderOption({
  page
}) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await openWebMCPInput(page)
  await page.getByText('Options', { exact: true }).click()

  const providerSelect = page.getByLabel('Provider')
  await expect(providerSelect).toBeVisible()
  const providerLabels = await providerSelect.locator('option').allTextContents()
  expect(providerLabels).toContain('Browser local AI')

  await providerSelect.selectOption('planner:browser-local-ai')
  await expect(providerSelect).toHaveValue('planner:browser-local-ai')
  await expect(page.locator('webmcp-command-input .webmcp-status')).toContainText(
    'Browser local AI · Qwen3.5 4B (8k context)'
  )
  await expect(page.getByLabel('Model')).toHaveValue('Qwen3.5-4B-q4f16_1-MLC')
})

test('exposes the full demo provider and model matrix', async function testProviderModelMatrix({
  page
}) {
  await installLanguageModelMock(page, 'available')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await openWebMCPInput(page)
  await page.getByText('Options', { exact: true }).click()

  const providerSelect = page.getByLabel('Provider')
  await expect(providerSelect).toBeVisible()
  await expect(providerSelect).toHaveValue('planner:browser-local-ai')
  await expect(page.locator('webmcp-command-input .webmcp-status')).toContainText(
    'Browser local AI · Qwen3.5 4B (8k context)'
  )
  await expect(providerSelect.locator('option')).toHaveText([
    'Chrome built-in AI',
    'Browser local AI',
    'Demo deterministic',
    'Cloudflare binding',
    'OpenRouter',
    'OpenAI',
    'Auto'
  ])
  await expect(page.getByLabel('Model').locator('option')).toHaveText([
    'Qwen3.5 4B (8k context)',
    'Hermes 3 Llama 3.1 8B',
    'Qwen3.5 2B'
  ])

  await providerSelect.selectOption('cloudflare-binding')
  await expect(page.getByLabel('Model').locator('option')).toHaveText([
    'GLM 4.7 Flash',
    'GPT OSS 20B',
    'Kimi K2.6',
    'Qwen3 30B A3B FP8',
    'DeepSeek R1 Distill Qwen 32B',
    'Qwen QwQ 32B',
    'Nemotron 3 120B A12B',
    'Gemma 4 26B A4B'
  ])

  await providerSelect.selectOption('openrouter')
  await expect(page.getByLabel('Model').locator('option')).toHaveText([
    'Nemotron 3 Super 120B A12B',
    'Nemotron Nano 9B V2'
  ])

  await providerSelect.selectOption('openai')
  await expect(page.getByLabel('Model')).toHaveCount(0)
  await expect(page.locator('webmcp-command-input .webmcp-status')).toContainText(
    'OpenAI · GPT-5.4 mini'
  )

  await providerSelect.selectOption('planner:browser-local-ai')
  await expect(page.getByLabel('Model').locator('option')).toHaveText([
    'Qwen3.5 4B (8k context)',
    'Hermes 3 Llama 3.1 8B',
    'Qwen3.5 2B'
  ])
  await expect(page.locator('webmcp-command-input .webmcp-status')).toContainText(
    'Browser local AI · Qwen3.5 4B (8k context)'
  )
})

test('serves the browser local AI module in dev', async function testBrowserLocalModuleServed({
  page
}) {
  await page.goto('/')
  const response = await page.request.get('/node_modules/.vite/deps/@mlc-ai_web-llm.js')

  expect(response.status()).toBeLessThan(500)
  expect(response.status()).not.toBe(404)
})

test('runs the browser local AI provider through the command input', async function testBrowserLocalProviderRun({
  page
}) {
  const failedBrowserLocalRequests: string[] = []
  page.on('requestfailed', function trackFailedBrowserLocalRequest(request) {
    if (request.url().includes('@mlc-ai_web-llm')) {
      failedBrowserLocalRequests.push(`${request.url()} ${request.failure()?.errorText ?? ''}`)
    }
  })
  await page.route('**/node_modules/.vite/deps/@mlc-ai_web-llm.js*', fulfillWebLLMRoute)
  await page.addInitScript(function installWebGPUMock() {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: async function requestAdapter() {
          return {}
        }
      }
    })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'planner:browser-local-ai')

  await getCommandTextbox(page).fill('Select all the liquids')
  await page.getByRole('button', { name: 'Run', exact: true }).click()

  await expect(page.getByText('5 selected')).toBeVisible()
  await expect(getItemInput(page, 'Water')).toBeChecked()
  await expect(getItemInput(page, 'Coffee')).toBeChecked()
  await expect(getItemInput(page, 'Milk')).toBeChecked()
  await expect(getItemInput(page, 'Sparkling water')).toBeChecked()
  await expect(getItemInput(page, 'Tea')).toBeChecked()
  expect(failedBrowserLocalRequests).toEqual([])
})

test('covers commerce tools through the browser bridge and confirmation flow', async function testCommerceToolFlows({
  page
}) {
  await page.goto('/commerce/')
  await expect(page.getByRole('heading', { name: 'Commerce', exact: true })).toBeVisible()
  await waitForWebMCPTool(page, 'search_products')

  const searchResult = await invokeWebMCPTool<Array<{ id: string }>>(page, {
    toolName: 'search_products',
    input: { query: 'camera' },
    source: 'planner'
  })
  expect(searchResult.status).toBe('success')
  expect(searchResult.output).toEqual([
    expect.objectContaining({
      id: 'cam-03'
    })
  ])

  await invokeWebMCPTool(page, {
    toolName: 'add_to_cart',
    input: {
      productId: 'kbd-01',
      quantity: 2
    },
    source: 'planner'
  })
  await expect(page.getByLabel('Quantity for Low-profile keyboard')).toHaveValue('2')
  await expect(page.locator('.cart-total')).toContainText('€258')

  await invokeWebMCPTool(page, {
    toolName: 'update_cart_quantity',
    input: {
      productId: 'kbd-01',
      quantity: 3
    },
    source: 'planner'
  })
  await expect(page.getByLabel('Quantity for Low-profile keyboard')).toHaveValue('3')
  await expect(page.locator('.cart-total')).toContainText('€387')

  await invokeWebMCPTool(page, {
    toolName: 'apply_cart_discount',
    input: {
      percent: 10
    },
    source: 'planner'
  })
  await expect(page.getByLabel('Discount %')).toHaveValue('10')
  await expect(page.locator('.cart-total')).toContainText('€348')

  const checkoutPromise = invokeWebMCPTool(page, {
    toolName: 'checkout_cart',
    input: {},
    source: 'planner'
  })
  const checkoutDialog = page.getByRole('dialog', {
    name: /Checkout clears the cart/
  })
  await expect(checkoutDialog).toBeVisible()
  await expect(checkoutDialog).toContainText('checkout_cart')
  await checkoutDialog.getByRole('button', { name: 'Approve action' }).click()

  const checkoutResult = await checkoutPromise
  expect(checkoutResult.status).toBe('success')
  await expect(page.getByText('No cart lines yet.')).toBeVisible()
  await expect(page.locator('.cart-total')).toContainText('€0')
})

test('shows command guard failures in the latest plan panel', async function testCommerceGuardStory({
  page
}) {
  await page.goto('/commerce/')
  await expect(page.getByRole('heading', { name: 'Commerce', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'local', 'add_to_cart')

  await getCommandTextbox(page).fill('Add 20 keyboard kits to the cart')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(page.locator('.latest-plan')).toContainText('add_to_cart')
  await expect(page.locator('.latest-plan')).toContainText('"quantity": 20')
  await expect(page.locator('.latest-plan')).toContainText(
    'Requested quantity exceeds available stock.'
  )
})

test('covers support form tools and ticket board mutations', async function testSupportToolFlows({
  page
}) {
  await page.goto('/support/')
  await expect(page.getByRole('heading', { name: 'Support', exact: true })).toBeVisible()
  await waitForWebMCPTool(page, 'create_support_ticket')

  await page.getByLabel('Subject').fill('Workspace login')
  await page.getByLabel('Details').fill('The user cannot sign in after the password reset.')
  await page.getByRole('button', { name: 'Create ticket' }).click()

  await expect(page.getByText('Workspace login', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Status for Workspace login')).toHaveValue('new')
  await expect(page.getByLabel('Assignee for Workspace login')).toHaveValue('Unassigned')
  await expect(page.getByLabel('Priority for Workspace login')).toHaveValue('medium')

  const updateResult = await invokeWebMCPTool(page, {
    toolName: 'update_ticket',
    input: {
      assignee: 'Sofia',
      id: 'ticket_1',
      priority: 'urgent',
      status: 'resolved'
    },
    source: 'planner'
  })
  expect(updateResult.status).toBe('success')
  await expect(page.getByLabel('Status for Billing access')).toHaveValue('resolved')
  await expect(page.getByLabel('Assignee for Billing access')).toHaveValue('Sofia')
  await expect(page.getByLabel('Priority for Billing access')).toHaveValue('urgent')
})

test('executes chained local invoice commands with confirmation', async function testLocalInvoiceChain({
  page
}) {
  await page.goto('/invoices/')
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible()

  await page.getByRole('row', { name: /Northwind/ }).click()
  await expect(page.locator('.active-record strong').filter({ hasText: 'Northwind' })).toBeVisible()

  await selectPlannerProvider(page, 'local', 'update_selected_invoice_status')

  await getCommandTextbox(page).fill('Mark Stark Industries invoices as paid')
  await page.getByRole('button', { name: 'Run' }).click()
  const statusDialog = page.getByRole('dialog', {
    name: /Changing invoice status mutates business records/
  })
  await expect(statusDialog).toBeVisible()
  await expect(statusDialog).toContainText('Approval boundary')
  await expect(statusDialog).toContainText('"status": "paid"')
  await statusDialog.getByRole('button', { name: 'Approve action' }).click()

  const starkInvoiceRow = page.getByRole('row', { name: /Stark Industries/ })
  await expect(page.getByLabel('Select Stark Industries')).toBeChecked()
  await expect(starkInvoiceRow).toContainText('paid')
  await expect(page.locator('.latest-plan')).toContainText(
    'select_invoices -> update_selected_invoice_status'
  )
})

test('rechecks Chrome AI before running a command if the page mounted with fallback', async function testPlannerRefresh({
  page
}) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'auto')

  await installLanguageModelInPage(page, 'available')

  await getCommandTextbox(page).fill('Select all fruits')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(getItemInput(page, 'Apple')).toBeChecked()
  await expect(getItemInput(page, 'Grapefruit')).toBeChecked()
})

test('exposes registered tools through Playwright helpers', async function testPlaywrightHelpers({
  page
}) {
  await installLanguageModelMock(page, 'available')
  await page.goto('/')
  await waitForWebMCPTool(page, 'select_items')

  const tools = await listWebMCPTools(page)
  expect(
    tools.map(function getToolName(tool) {
      return tool.name
    })
  ).toContain('select_items')

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

test('exposes only page-specific tools on each demo route', async function testRouteSpecificTools({
  page
}) {
  const routeTools = [
    {
      path: '/',
      readyTool: 'select_items',
      tools: ['clear_item_selection', 'select_items', 'sort_inventory']
    },
    {
      path: '/invoices/',
      readyTool: 'open_invoice',
      tools: [
        'create_invoice',
        'filter_invoices',
        'open_invoice',
        'select_invoices',
        'sort_invoices',
        'update_selected_invoice_status'
      ]
    },
    {
      path: '/commerce/',
      readyTool: 'search_products',
      tools: [
        'add_to_cart',
        'apply_cart_discount',
        'checkout_cart',
        'remove_from_cart',
        'search_products',
        'update_cart_quantity'
      ]
    },
    {
      path: '/support/',
      readyTool: 'create_support_ticket',
      tools: ['create_support_ticket', 'update_ticket']
    }
  ]

  for (const route of routeTools) {
    await page.goto(route.path)
    await waitForWebMCPTool(page, route.readyTool)

    const tools = await listWebMCPTools(page)
    expect(
      tools
        .map(function getToolName(tool) {
          return tool.name
        })
        .sort()
    ).toEqual(route.tools)
  }
})

test('plans through the dev OpenRouter server provider', async function testOpenRouterProviderSelection({
  page
}) {
  await page.route('**/api/webmcp/plan', async function fulfillOpenRouter(route, request) {
    expect(request.postDataJSON()).toMatchObject({
      provider: 'openrouter',
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      message: 'Select all French items'
    })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        toolName: 'select_items',
        input: { ids: ['item_4', 'item_7', 'item_13', 'item_18', 'item_22'] },
        confidence: 0.94,
        reason: 'OpenRouter selected French items from current inventory context.'
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

test('plans through the dev OpenAI server provider', async function testOpenAIProviderSelection({
  page
}) {
  await page.route('**/api/webmcp/plan', async function fulfillOpenAI(route, request) {
    expect(request.postDataJSON()).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      message: 'Select all French items'
    })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        toolName: 'select_items',
        input: { ids: ['item_4', 'item_7', 'item_13', 'item_18', 'item_22'] },
        confidence: 0.93,
        reason: 'OpenAI selected French items from current inventory context.'
      })
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await selectPlannerProvider(page, 'openai')

  await getCommandTextbox(page).fill('Select all French items')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(getItemInput(page, 'Croissant')).toBeChecked()
  await expect(getItemInput(page, 'Quiche')).toBeChecked()
})

test('plans through the dev Cloudflare binding provider', async function testCloudflareBindingProviderSelection({
  page
}) {
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
  await selectPlannerProvider(page, 'cloudflare-binding', 'select_items', '@cf/qwen/qwq-32b')
  await getCommandTextbox(page).fill('Select all French items')
  await page.getByRole('button', { name: 'Run' }).click()

  await expect(getItemInput(page, 'Croissant')).toBeChecked()
  await expect(getItemInput(page, 'Quiche')).toBeChecked()
})

test('keeps demo pages responsive without forcing cramped columns', async function testResponsiveDemoLayouts({
  page
}) {
  const viewports = [
    { width: 320, height: 700 },
    { width: 390, height: 840 },
    { width: 768, height: 900 },
    { width: 1154, height: 900 },
    { width: 1440, height: 1000 }
  ]
  const paths = ['/', '/invoices/', '/commerce/', '/support/', '/guide/', '/readme/']

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)

    for (const path of paths) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      if (path === '/readme/') {
        await expect(page.locator('.readme-document')).toBeVisible()
      } else if (path === '/guide/') {
        await expect(page.locator('.guide-header')).toBeVisible()
      } else {
        await expect(page.locator('.demo-page-header')).toBeVisible()
      }

      const hasHorizontalOverflow = await page.evaluate(function hasHorizontalPageOverflow() {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalOverflow).toBe(false)
    }

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
    const inventoryRow = page.getByRole('row', { name: /Apple/ })
    await inventoryRow.scrollIntoViewIfNeeded()
    await expect(inventoryRow).toBeVisible()

    await page.goto('/invoices/')
    await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible()
    await expect(page.locator('.table-controls select[value="all"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select visible' })).toBeVisible()

    await openWebMCPInput(page)
    const commandPanelLayout = await page.evaluate(function getCommandPanelLayout() {
      const commandInput = document.querySelector('webmcp-command-input')
      const panel = commandInput?.shadowRoot?.querySelector('.webmcp-floating-panel')
      const diagnostics =
        commandInput?.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
      diagnostics?.setAttribute('open', '')
      diagnostics?.dispatchEvent(new Event('toggle'))
      document.querySelector<HTMLButtonElement>('.wmk-devtools__toggle')?.click()

      const diagnosticsContent = commandInput?.shadowRoot?.querySelector(
        '.webmcp-diagnostics-content'
      )
      const devtoolsPanel = document.querySelector('.wmk-devtools__panel')

      return {
        diagnosticsContent: getElementBounds(diagnosticsContent),
        devtoolsPanel: getElementBounds(devtoolsPanel),
        panel: getElementBounds(panel)
      }

      function getElementBounds(element: Element | null | undefined) {
        if (!element) return undefined
        const box = element.getBoundingClientRect()
        return {
          bottom: Math.round(box.bottom),
          height: Math.round(box.height),
          right: Math.round(box.right),
          width: Math.round(box.width)
        }
      }
    })

    expect(commandPanelLayout.panel).toBeDefined()
    expect(commandPanelLayout.diagnosticsContent).toBeDefined()
    expect(commandPanelLayout.devtoolsPanel).toBeDefined()
    expect(commandPanelLayout.panel!.right).toBeLessThanOrEqual(viewport.width)
    expect(commandPanelLayout.panel!.bottom).toBeLessThanOrEqual(viewport.height)
    expect(commandPanelLayout.diagnosticsContent!.bottom).toBeLessThanOrEqual(viewport.height)
    if (viewport.width <= 768) {
      expect(commandPanelLayout.devtoolsPanel!.height).toBeLessThanOrEqual(
        commandPanelLayout.diagnosticsContent!.height
      )
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

test('renders README Mermaid diagrams', async function testReadmeMermaidDiagrams({ page }) {
  const htmlResponse = await page.request.get('/readme/')
  const html = await htmlResponse.text()
  expect(html.indexOf('visibility:hidden')).toBeGreaterThan(-1)
  expect(html.indexOf('visibility:hidden')).toBeLessThan(html.indexOf('flowchart TB'))

  await page.goto('/readme/')

  const codeBlockStyles = await page
    .locator('pre[data-language="ts"]')
    .first()
    .evaluate(function getCodeBlockStyles(block) {
      const code = block.querySelector('code')
      const styledToken = block.querySelector('span[style]')

      return {
        background: getComputedStyle(block).backgroundColor,
        codeColor: code ? getComputedStyle(code).color : '',
        styledTokenColor: styledToken ? getComputedStyle(styledToken).color : ''
      }
    })
  expect(codeBlockStyles.background).toBe('rgb(20, 23, 31)')
  expect(codeBlockStyles.codeColor).toBe('rgb(231, 236, 244)')
  expect(codeBlockStyles.styledTokenColor).not.toBe('rgb(20, 20, 20)')

  const mermaidDiagram = page.locator('.readme-mermaid').first()
  await expect(mermaidDiagram.locator('svg')).toBeVisible()
  await expect(mermaidDiagram).toHaveAttribute('data-rendered', 'true')
  const diagramBox = await mermaidDiagram.boundingBox()
  const svgBox = await mermaidDiagram.locator('svg').boundingBox()
  expect(diagramBox?.height ?? 0).toBeGreaterThan(400)
  expect(svgBox?.height ?? 0).toBeGreaterThan(360)
  await expect(mermaidDiagram.locator('svg')).toContainText('User command')
  await expect(mermaidDiagram.locator('svg')).toContainText('WebMCP tool registry')
  await expect(page.locator('pre[data-language="mermaid"]')).toHaveCount(0)
  const iconResponse = await page.request.get('/webmcp-circuit.svg')
  expect(iconResponse.ok()).toBe(true)

  const hasHorizontalOverflow = await page.evaluate(function hasHorizontalPageOverflow() {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
  })
  expect(hasHorizontalOverflow).toBe(false)
})

async function installLanguageModelMock(page: Page, availability: LanguageModelAvailability) {
  await page.addInitScript({
    content: `(${installLanguageModel.toString()})(window, ${JSON.stringify(availability)})`
  })
}

async function installLanguageModelInPage(page: Page, availability: LanguageModelAvailability) {
  await page.evaluate(
    function mockLanguageModel(options) {
      const install = new Function(`return (${options.source})`)() as (
        targetWindow: Window,
        mockAvailability: LanguageModelAvailability
      ) => void
      install(window, options.availability)
    },
    {
      availability,
      source: installLanguageModel.toString()
    }
  )
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

async function selectPlannerProvider(
  page: Page,
  provider: string,
  toolName = 'select_items',
  model?: string
) {
  await waitForWebMCPTool(page, toolName)
  await openWebMCPInput(page)
  const optionsSummary = page.getByText('Options', { exact: true })
  if (await optionsSummary.isVisible()) {
    await optionsSummary.click()
  }

  const providerSelect = page.getByLabel('Provider')
  if (!(await providerSelect.isVisible())) {
    await page.evaluate(
      function configurePlanner(options) {
        const commandInput = document.querySelector('webmcp-command-input') as
          | WebMCPCommandInputElement
          | undefined
        if (!commandInput) throw new Error('Expected WebMCP command input.')

        commandInput.planner = undefined
        const provider = options.provider.startsWith('planner:')
          ? undefined
          : (options.provider as WebMCPCommandInputElement['provider'])
        commandInput.configure({
          endpoint: options.endpoint,
          model: options.model,
          provider
        })
      },
      {
        endpoint: isServerProvider(provider) ? '/api/webmcp/plan' : undefined,
        model: model ?? getE2EPlannerModel(provider),
        provider
      }
    )
    return
  }

  const visibleProvider = provider === 'local' ? 'planner:demo-deterministic' : provider
  await providerSelect.selectOption(visibleProvider)
  await expect(providerSelect).toHaveValue(visibleProvider)
  if (model) {
    const modelSelect = page.getByLabel('Model')
    await expect(modelSelect).toBeVisible()
    await modelSelect.selectOption(model)
    await expect(modelSelect).toHaveValue(model)
  }
}

function isServerProvider(provider: string): boolean {
  return provider === 'openrouter' || provider === 'openai' || provider === 'cloudflare-binding'
}

function getE2EPlannerModel(provider: string): string | undefined {
  if (provider === 'openrouter') return 'nvidia/nemotron-3-super-120b-a12b:free'
  if (provider === 'openai') return 'gpt-5.4-mini'
  return undefined
}

async function openWebMCPInput(page: Page) {
  const launcher = page.getByRole('button', { name: 'Open WebMCP command input' })
  if ((await launcher.getAttribute('aria-expanded')) !== 'true') {
    await launcher.click()
  }
}

function getItemInput(page: Page, itemName: string) {
  return page.getByLabel(`Select ${itemName}`)
}

function getCommandTextbox(page: Page) {
  return page.getByRole('textbox', { name: 'WebMCP' })
}

async function fulfillWebLLMRoute(route: Route) {
  await route.fulfill({
    contentType: 'application/javascript',
    body: `
      export async function CreateMLCEngine(_model, config) {
        config?.initProgressCallback?.({ progress: 1, text: 'Test model ready' })
        return {
          chat: {
            completions: {
              async create() {
                return {
                  choices: [
                    {
                      message: {
                        content: JSON.stringify({
                          toolName: 'select_items',
                          input: { ids: ['item_4', 'item_7'] },
                          confidence: 0.95,
                          reason: 'Incorrectly selected unrelated IDs from the test model.'
                        })
                      }
                    }
                  ]
                }
              }
            }
          },
          async unload() {}
        }
      }
    `
  })
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
          const request =
            message.match(/User request: ([\s\S]*?)\n\nCurrent app context/)?.[1] ?? message

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
