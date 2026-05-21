import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineWebMCPCommandInput } from './command-input'
import { defineTool } from './define-tool'
import type { WebMCPCommandInputElement, WebMCPCommandPlannerEventDetail, WebMCPCommandResultEventDetail } from './interfaces/command-input'
import type { ToolPlanner } from './interfaces/tool'
import { clearToolsForTest, registerTool } from './registry'

let tagCounter = 0
const defaultViewport = {
  height: window.innerHeight,
  width: window.innerWidth
}

describe('WebMCP command input', () => {
  afterEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
    setViewportSize(defaultViewport.width, defaultViewport.height)
  })

  it('plans a command and invokes the selected registered tool', async () => {
    const execute = vi.fn(function executeSearch(input: Record<string, unknown>) {
      return {
        query: input.query
      }
    })
    registerTool(defineTool({
      name: 'search_products',
      description: 'Search visible products.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query'],
        additionalProperties: false
      },
      execute
    }))

    const planner: ToolPlanner = {
      name: 'Test planner',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async plan(message, tools, context) {
        expect(message).toBe('Find docks')
        expect(tools.map(function mapTool(tool) {
          return tool.name
        })).toEqual(['search_products'])
        expect(context).toEqual({
          route: 'catalog'
        })

        return {
          toolName: 'search_products',
          input: {
            query: 'dock'
          },
          confidence: 0.9,
          reason: 'Matched product search.'
        }
      }
    }
    const element = createCommandInputElement()
    element.planner = planner
    element.context = function getPlannerContext() {
      return {
        route: 'catalog'
      }
    }

    const resultEvent = waitForCommandResult(element)
    document.body.append(element)
    await Promise.resolve()

    const input = getPromptInput(element)
    const form = getPromptForm(element)
    input.value = 'Find docks'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    const event = await resultEvent
    expect(event.detail.result.status).toBe('success')
    expect(event.detail.result.output).toEqual({
      query: 'dock'
    })
    expect(execute).toHaveBeenCalledWith({
      query: 'dock'
    }, {
      source: 'planner'
    })
  })

  it('hides provider and model controls when both are initialized by attributes', async () => {
    const element = createCommandInputElement()
    element.setAttribute('provider', 'openai')
    element.setAttribute('model', 'gpt-5.4-mini')
    element.setAttribute('endpoint', '/api/webmcp/plan')

    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
  })

  it('restores provider controls when a fixed provider attribute is removed', async () => {
    const element = createCommandInputElement()
    element.setAttribute('provider', 'openai')
    element.setAttribute('model', 'gpt-5.4-mini')

    document.body.append(element)
    await Promise.resolve()

    element.removeAttribute('provider')
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(provider).toBeInstanceOf(HTMLSelectElement)
    expect(provider?.value).toBe('auto')
    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
  })

  it('shows configurable provider and model controls when they are not fixed', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(provider).toBeInstanceOf(HTMLSelectElement)
    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()

    if (!provider) throw new Error('Expected provider control.')
    provider.value = 'openai'
    provider.dispatchEvent(new Event('change', { bubbles: true }))

    const settings = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
    const model = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-model]')
    expect(settings?.open).toBe(true)
    expect(model).toBeInstanceOf(HTMLSelectElement)
    expect(model?.value).toBe('gpt-5.4-mini')
  })

  it('shows Cloudflare models as a dropdown after choosing Cloudflare binding', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    if (!provider) throw new Error('Expected provider control.')
    provider.value = 'cloudflare-binding'
    provider.dispatchEvent(new Event('change', { bubbles: true }))

    const settings = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
    const model = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-model]')
    expect(settings?.open).toBe(true)
    expect(model).toBeInstanceOf(HTMLSelectElement)
    expect(model?.value).toBe('@cf/moonshotai/kimi-k2.6')
    expect(Array.from(model?.options ?? []).map(function mapOption(option) {
      return option.value
    })).toContain('@cf/openai/gpt-oss-20b')
  })

  it('renders slotted diagnostics inside an expandable row', async () => {
    const element = createCommandInputElement()
    const diagnostics = document.createElement('section')
    diagnostics.slot = 'diagnostics'
    diagnostics.textContent = 'Runtime diagnostics'
    element.append(diagnostics)

    document.body.append(element)
    await Promise.resolve()

    const diagnosticsRow = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
    const diagnosticsSummary = element.shadowRoot?.querySelector<HTMLElement>('.webmcp-disclosure-summary')
    const diagnosticsSlot = element.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="diagnostics"]')
    const status = element.shadowRoot?.querySelector<HTMLElement>('.webmcp-settings-summary .webmcp-status')
    expect(diagnosticsRow).toBeInstanceOf(HTMLDetailsElement)
    expect(diagnosticsSummary?.tagName).toBe('SUMMARY')
    expect(diagnosticsRow?.textContent).toContain('Developer diagnostics')
    expect(diagnosticsSlot?.assignedElements()).toEqual([diagnostics])
    expect(status?.textContent?.trim()).toBe('Auto')
  })

  it('renders floating mode with a stacked trigger and expandable panel', async () => {
    const element = createCommandInputElement()
    element.setAttribute('floating', '')

    document.body.append(element)
    await Promise.resolve()

    const trigger = element.shadowRoot?.querySelector<HTMLButtonElement>('.webmcp-floating-trigger')
    const triggerWords = Array.from(trigger?.querySelectorAll('span') ?? []).map(function mapWord(word) {
      return word.textContent
    })
    const panel = element.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')
    expect(trigger).toBeInstanceOf(HTMLButtonElement)
    expect(triggerWords).toEqual(['WEB', 'MCP'])
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(panel?.hidden).toBe(true)
    expect(window.getComputedStyle(panel as Element).display).toBe('none')

    trigger?.click()

    const expandedTrigger = element.shadowRoot?.querySelector<HTMLButtonElement>('.webmcp-floating-trigger')
    const expandedPanel = element.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')
    expect(expandedTrigger?.getAttribute('aria-expanded')).toBe('true')
    expect(expandedPanel?.hidden).toBe(false)
    expect(window.getComputedStyle(expandedPanel as Element).display).not.toBe('none')

    expandedTrigger?.click()

    const collapsedTrigger = element.shadowRoot?.querySelector<HTMLButtonElement>('.webmcp-floating-trigger')
    const collapsedPanel = element.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')
    expect(collapsedTrigger?.getAttribute('aria-expanded')).toBe('false')
    expect(collapsedPanel?.hidden).toBe(true)
    expect(window.getComputedStyle(collapsedPanel as Element).display).toBe('none')
  })

  it('updates floating placement after expanding panel disclosures', async () => {
    const element = createCommandInputElement()
    const diagnostics = document.createElement('section')
    diagnostics.slot = 'diagnostics'
    diagnostics.textContent = 'Runtime diagnostics'
    element.append(diagnostics)
    element.setAttribute('floating', '')

    document.body.append(element)
    await Promise.resolve()

    const trigger = element.shadowRoot?.querySelector<HTMLButtonElement>('.webmcp-floating-trigger')
    trigger?.click()

    const placementController = element as unknown as { updateFloatingPlacement: () => void }
    const updateFloatingPlacement = vi.spyOn(placementController, 'updateFloatingPlacement')
    const settings = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
    const diagnosticsRow = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')

    settings?.dispatchEvent(new Event('toggle'))
    diagnosticsRow?.dispatchEvent(new Event('toggle'))

    expect(updateFloatingPlacement).toHaveBeenCalledTimes(2)
  })

  it('keeps the floating trigger pinned to the viewport edge when resizing back up', async () => {
    setViewportSize(1200, 900)
    const element = createCommandInputElement()
    element.setAttribute('floating', '')

    document.body.append(element)
    await Promise.resolve()

    expect(element.style.left).toBe('')
    expect(element.style.top).toBe('')
    expect(element.style.right).toBe('8px')
    expect(element.style.bottom).toBe('8px')

    setViewportSize(640, 500)
    window.dispatchEvent(new Event('resize'))

    expect(element.style.left).toBe('')
    expect(element.style.top).toBe('')
    expect(element.style.right).toBe('8px')
    expect(element.style.bottom).toBe('8px')

    setViewportSize(1200, 900)
    window.dispatchEvent(new Event('resize'))

    expect(element.style.left).toBe('')
    expect(element.style.top).toBe('')
    expect(element.style.right).toBe('8px')
    expect(element.style.bottom).toBe('8px')
  })

  it('uses initial planner choices without locking the controls', async () => {
    const element = createCommandInputElement()
    document.body.append(element)

    element.configure({
      initialModel: '@cf/moonshotai/kimi-k2.6',
      initialProvider: 'cloudflare-binding'
    })
    await Promise.resolve()

    const providerControl = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    const modelControl = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-model]')
    expect(providerControl?.value).toBe('cloudflare-binding')
    expect(modelControl?.value).toBe('@cf/moonshotai/kimi-k2.6')

    providerControl!.value = 'local'
    providerControl!.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()

    expect(providerControl?.value).toBe('local')
    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
  })

  it('emits planner status when the selected provider changes', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const event = waitForCommandPlanner(element)
    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    if (!provider) throw new Error('Expected provider control.')
    provider.value = 'local'
    provider.dispatchEvent(new Event('change', { bubbles: true }))

    await expect(event).resolves.toMatchObject({
      detail: {
        planner: expect.objectContaining({
          name: 'Local heuristic planner',
          status: 'fallback'
        })
      }
    })
  })

  it('keeps commands usable when selected Chrome built-in AI is unavailable', async () => {
    registerTool(defineTool({
      name: 'add_to_cart',
      description: 'Add a product to the cart.',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'number' }
        },
        required: ['productId', 'quantity'],
        additionalProperties: false
      },
      execute(input) {
        return input
      }
    }))

    const element = createCommandInputElement()
    element.setAttribute('provider', 'chrome-built-in')
    document.body.append(element)
    await Promise.resolve()

    const result = await element.run('Add ten keyboards to the cart.')

    expect(result).toMatchObject({
      status: 'success',
      toolName: 'add_to_cart',
      output: {
        productId: 'kbd-01',
        quantity: 10
      }
    })
  })

  it('hides controls when provider and model are fixed through configure', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpoint: '/api/webmcp/plan',
      model: 'gpt-5.4-mini',
      provider: 'openai'
    })

    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
  })

  it('does not show superseded planner refreshes after late configuration', async () => {
    const element = createCommandInputElement()
    document.body.append(element)

    element.configure({
      planner: {
        name: 'Configured planner',
        available: true,
        status: 'ready',
        detail: 'Configured after mount.',
        async plan() {
          return {
            toolName: 'search_products',
            input: {},
            confidence: 0.5,
            reason: 'Test planner.'
          }
        }
      }
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(element.shadowRoot?.textContent).toContain('Configured planner')
    expect(element.shadowRoot?.textContent).not.toContain('superseded')
  })
})

function createCommandInputElement(): WebMCPCommandInputElement {
  const tagName = `webmcp-command-input-test-${tagCounter++}`
  defineWebMCPCommandInput(tagName)
  return document.createElement(tagName) as WebMCPCommandInputElement
}

function getPromptInput(element: WebMCPCommandInputElement): HTMLInputElement {
  const input = element.shadowRoot?.querySelector<HTMLInputElement>('[data-command-input]')
  if (!input) throw new Error('Expected command input.')
  return input
}

function getPromptForm(element: WebMCPCommandInputElement): HTMLFormElement {
  const form = element.shadowRoot?.querySelector<HTMLFormElement>('form')
  if (!form) throw new Error('Expected command form.')
  return form
}

function waitForCommandResult(element: WebMCPCommandInputElement): Promise<CustomEvent<WebMCPCommandResultEventDetail>> {
  return new Promise(function resolveCommandResult(resolve) {
    element.addEventListener('webmcp-command-result', function handleResult(event) {
      resolve(event as CustomEvent<WebMCPCommandResultEventDetail>)
    }, { once: true })
  })
}

function waitForCommandPlanner(element: WebMCPCommandInputElement): Promise<CustomEvent<WebMCPCommandPlannerEventDetail>> {
  return new Promise(function resolveCommandPlanner(resolve) {
    element.addEventListener('webmcp-command-planner', function handlePlanner(event) {
      resolve(event as CustomEvent<WebMCPCommandPlannerEventDetail>)
    }, { once: true })
  })
}

function setViewportSize(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height
  })
}
