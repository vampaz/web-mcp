import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineWebMCPCommandInput } from './command-input'
import { defineTool } from './define-tool'
import type {
  WebMCPCommandInputElement,
  WebMCPCommandInputPlannerCreateOptions,
  WebMCPCommandPlannerEventDetail,
  WebMCPCommandResultEventDetail,
  WebMCPCommandStepEventDetail
} from './interfaces/command-input'
import type { ToolPlan, ToolPlanner } from './interfaces/tool'
import { clearToolsForTest, registerTool } from './registry'

interface WindowWithLanguageModel extends Window {
  LanguageModel?: {
    availability: (
      options?: unknown
    ) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
    create: (options?: unknown) => Promise<{
      prompt: (message: string) => Promise<string>
    }>
  }
}

let tagCounter = 0
const defaultViewport = {
  height: window.innerHeight,
  width: window.innerWidth
}

describe('WebMCP command input', () => {
  afterEach(() => {
    clearToolsForTest()
    delete (window as WindowWithLanguageModel).LanguageModel
    document.body.innerHTML = ''
    setViewportSize(defaultViewport.width, defaultViewport.height)
  })

  it('plans a command and invokes the selected registered tool', async () => {
    const execute = vi.fn(function executeSearch(input: Record<string, unknown>) {
      return {
        query: input.query
      }
    })
    registerTool(
      defineTool({
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
      })
    )

    const planner: ToolPlanner = {
      name: 'Test planner',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async plan(message, tools, context) {
        expect(message).toBe('Find docks')
        expect(
          tools.map(function mapTool(tool) {
            return tool.name
          })
        ).toEqual(['search_products'])
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
    expect(execute).toHaveBeenCalledWith(
      {
        query: 'dock'
      },
      {
        source: 'planner'
      }
    )
  })

  it('returns planner outcomes without invoking a registered tool', async () => {
    const planner: ToolPlanner = {
      name: 'Outcome planner',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async plan() {
        return {
          toolName: 'no_tools_match',
          input: {},
          confidence: 0,
          reason: 'No tool can satisfy this command.'
        }
      }
    }
    const element = createCommandInputElement()
    element.planner = planner

    document.body.append(element)
    await Promise.resolve()

    await expect(element.run('Send the weekly report')).resolves.toMatchObject({
      toolName: 'no_tools_match',
      status: 'unavailable',
      error: 'No tool can satisfy this command.'
    })
  })

  it('marks the run button as planning while the planner is working', async () => {
    const planRequest = createDeferred<ToolPlan>()
    registerTool(
      defineTool({
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
        execute(input) {
          return input
        }
      })
    )

    const planner: ToolPlanner = {
      name: 'Slow planner',
      available: true,
      status: 'ready',
      detail: 'Planning in progress.',
      async plan() {
        return await planRequest.promise
      }
    }
    const element = createCommandInputElement()
    element.planner = planner
    document.body.append(element)
    await Promise.resolve()

    const result = element.run('Find docks')
    await Promise.resolve()
    await Promise.resolve()

    const button = element.shadowRoot?.querySelector<HTMLButtonElement>('.webmcp-run-button')
    expect(button?.dataset.phase).toBe('planning')
    expect(button?.getAttribute('aria-busy')).toBe('true')

    planRequest.resolve({
      toolName: 'search_products',
      input: {
        query: 'dock'
      },
      confidence: 0.9,
      reason: 'Matched product search.'
    })
    await result
  })

  it('emits progress events for planned tool sequences', async () => {
    registerTool(
      defineTool({
        name: 'select_items',
        description: 'Select checklist items.',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['ids'],
          additionalProperties: false
        },
        execute(input) {
          return input
        }
      })
    )
    registerTool(
      defineTool({
        name: 'clear_item_selection',
        description: 'Clear selected checklist items.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        execute(input) {
          return input
        }
      })
    )

    const planner: ToolPlanner = {
      name: 'Sequence planner',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async plan() {
        return {
          toolName: 'tool_sequence',
          input: {},
          confidence: 0.9,
          reason: 'Select and clear.',
          steps: [
            {
              toolName: 'select_items',
              input: { ids: ['item_1'] },
              confidence: 0.9,
              reason: 'Selected the item.'
            },
            {
              toolName: 'clear_item_selection',
              input: {},
              confidence: 0.9,
              reason: 'Cleared selection.'
            }
          ]
        }
      }
    }
    const element = createCommandInputElement()
    const steps: WebMCPCommandStepEventDetail[] = []
    element.planner = planner
    element.addEventListener('webmcp-command-step', function handleStep(event) {
      steps.push((event as CustomEvent<WebMCPCommandStepEventDetail>).detail)
    })
    document.body.append(element)
    await Promise.resolve()

    await expect(element.run('Select then clear')).resolves.toMatchObject({
      status: 'success',
      toolName: 'clear_item_selection'
    })
    expect(
      steps.map(function mapStep(step) {
        return `${step.phase}:${step.step.toolName}:${step.stepIndex}/${step.stepCount}`
      })
    ).toEqual([
      'started:select_items:0/2',
      'completed:select_items:0/2',
      'started:clear_item_selection:1/2',
      'completed:clear_item_selection:1/2'
    ])
  })

  it('cancels a command before planning starts', async () => {
    const plan = vi.fn(async function createPlan() {
      return {
        toolName: 'search_products',
        input: { query: 'dock' },
        confidence: 0.9,
        reason: 'Should not run.'
      }
    })
    const planner: ToolPlanner = {
      name: 'Test planner',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      plan
    }
    const controller = new AbortController()
    const element = createCommandInputElement()
    element.planner = planner
    document.body.append(element)
    await Promise.resolve()
    controller.abort()

    await expect(element.run('Find docks', { signal: controller.signal })).resolves.toMatchObject({
      status: 'error',
      error: 'Command was cancelled.'
    })
    expect(plan).not.toHaveBeenCalled()
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

  it('does not render planner controls without consumer endpoint options', async () => {
    const element = createCommandInputElement()

    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.webmcp-settings')).toBeNull()
  })

  it('renders no planner controls for one consumer endpoint option', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'GPT-5.4 mini',
          model: 'gpt-5.4-mini',
          provider: 'openai'
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.webmcp-settings')).toBeNull()
  })

  it('shows provider and model controls from consumer endpoint options', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'OpenRouter Nemotron',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        },
        {
          label: 'OpenRouter Nano',
          model: 'nvidia/nemotron-nano-9b-v2:free',
          provider: 'openrouter'
        },
        {
          label: 'Cloudflare GLM',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        },
        {
          label: 'GPT-5.4 mini',
          model: 'gpt-5.4-mini',
          provider: 'openai'
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(provider).toBeInstanceOf(HTMLSelectElement)
    if (!provider) throw new Error('Expected provider control.')
    const settings = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
    const model = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-model]')
    expect(settings).toBeInstanceOf(HTMLDetailsElement)
    expect(model).toBeInstanceOf(HTMLSelectElement)
    expect(provider.value).toBe('openrouter')
    expect(model?.value).toBe('nvidia/nemotron-3-super-120b-a12b:free')
    expect(
      Array.from(provider.options).map(function mapOption(option) {
        return option.textContent
      })
    ).toEqual(['OpenRouter', 'Cloudflare binding', 'OpenAI'])
    expect(
      Array.from(model?.options ?? []).map(function mapOption(option) {
        return option.textContent
      })
    ).toEqual(['OpenRouter Nemotron', 'OpenRouter Nano'])
  })

  it('shows consumer planner options and runs the selected planner', async () => {
    registerTool(
      defineTool({
        name: 'select_items',
        description: 'Select checklist items.',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['ids'],
          additionalProperties: false
        },
        execute(input) {
          return input
        }
      })
    )
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'GPT-5.4 mini',
          model: 'gpt-5.4-mini',
          provider: 'openai'
        }
      ],
      plannerOptions: [
        {
          id: 'browser-local-ai',
          label: 'Browser local AI',
          modelOptions: [
            {
              label: 'Hermes 3',
              model: 'hermes-3'
            },
            {
              label: 'Qwen 2B',
              model: 'qwen-2b'
            }
          ],
          createPlanner(options) {
            return {
              name: 'Browser local AI',
              available: true,
              status: 'downloadable',
              detail: `Runs ${options?.model ?? 'unknown'} in the browser.`,
              async plan() {
                return {
                  toolName: 'select_items',
                  input: { ids: [options?.model ?? 'missing-model'] },
                  confidence: 0.9,
                  reason: 'Selected with a consumer planner.'
                }
              }
            }
          }
        },
        {
          id: 'custom-browser-planner',
          label: 'Custom browser planner',
          createPlanner() {
            return {
              name: 'Custom browser planner',
              available: true,
              status: 'ready',
              detail: 'Consumer-provided browser planner.',
              async plan() {
                return {
                  toolName: 'select_items',
                  input: { ids: ['item_7'] },
                  confidence: 0.9,
                  reason: 'Selected with a second consumer planner.'
                }
              }
            }
          }
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(provider).toBeInstanceOf(HTMLSelectElement)
    expect(
      Array.from(provider?.options ?? []).map(function mapOption(option) {
        return option.textContent
      })
    ).toEqual(['Browser local AI', 'Custom browser planner', 'OpenAI'])

    provider!.value = 'planner:browser-local-ai'
    provider!.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()

    const model = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-model]')
    expect(model).toBeInstanceOf(HTMLSelectElement)
    expect(model?.value).toBe('hermes-3')
    expect(element.shadowRoot?.textContent).toContain('Browser local AI')
    await expect(element.run('Select French items')).resolves.toMatchObject({
      status: 'success',
      output: { ids: ['hermes-3'] }
    })

    model!.value = 'qwen-2b'
    model!.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()

    await expect(element.run('Select French items')).resolves.toMatchObject({
      status: 'success',
      output: { ids: ['qwen-2b'] }
    })
  })

  it('updates the model control when the selected configured provider changes', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        },
        {
          label: 'Nemotron Nano 9B V2',
          model: 'nvidia/nemotron-nano-9b-v2:free',
          provider: 'openrouter'
        },
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    if (!provider) throw new Error('Expected provider control.')
    provider.value = 'cloudflare-binding'
    provider.dispatchEvent(new Event('change', { bubbles: true }))

    const settings = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
    const model = element.shadowRoot?.querySelector('[data-model]')
    expect(settings?.open).toBe(true)
    expect(provider.value).toBe('cloudflare-binding')
    expect(model).toBeNull()
    expect(element.shadowRoot?.textContent).toContain('Cloudflare binding · GLM 4.7 Flash')
  })

  it('adds Chrome built-in AI when the browser exposes the local LanguageModel API', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () =>
          JSON.stringify({
            toolName: 'select_items',
            input: { ids: ['item_8'] },
            confidence: 0.9,
            reason: 'Chrome selected water.'
          })
      })
    }
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        },
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(
      Array.from(provider?.options ?? []).map(function mapOption(option) {
        return option.textContent
      })
    ).toEqual(['Chrome built-in AI', 'Cloudflare binding', 'OpenRouter'])
    expect(provider?.value).toBe('chrome-built-in')

    if (!provider) throw new Error('Expected provider control.')
    provider.value = 'chrome-built-in'
    provider.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
    expect(element.shadowRoot?.textContent).toContain('Chrome built-in AI')
  })

  it('does not override a consumer-selected initial provider when Chrome built-in AI is detected', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => '{}'
      })
    }
    const element = createCommandInputElement()
    element.configure({
      initialProvider: 'cloudflare-binding',
      initialModel: '@cf/zai-org/glm-4.7-flash',
      endpointOptions: [
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        },
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(
      Array.from(provider?.options ?? []).map(function mapOption(option) {
        return option.textContent
      })
    ).toEqual(['Chrome built-in AI', 'Cloudflare binding', 'OpenRouter'])
    expect(provider?.value).toBe('cloudflare-binding')
  })

  it('lets consumers hide detected Chrome built-in AI', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => '{}'
      })
    }
    const element = createCommandInputElement()
    element.configure({
      showChromeAI: false,
      endpointOptions: [
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        },
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(
      Array.from(provider?.options ?? []).map(function mapOption(option) {
        return option.textContent
      })
    ).toEqual(['Cloudflare binding', 'OpenRouter'])
  })

  it('routes OpenRouter planning through the configured server endpoint', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        toolName: 'select_items',
        input: { ids: ['item_8'] },
        confidence: 0.91,
        reason: 'Server selected water.'
      })
    )
    vi.stubGlobal('fetch', fetch)
    registerTool(
      defineTool({
        name: 'select_items',
        description: 'Select checklist items.',
        inputSchema: {
          type: 'object'
        },
        execute(input) {
          return input
        }
      })
    )

    const element = createCommandInputElement()
    element.configure({
      endpoint: '/api/webmcp/plan',
      endpointOptions: [
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        },
        {
          label: 'Nemotron Nano 9B V2',
          model: 'nvidia/nemotron-nano-9b-v2:free',
          provider: 'openrouter'
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-provider]')).toBeNull()

    const result = await element.run('Select water')

    expect(result?.status).toBe('success')
    expect(fetch).toHaveBeenCalledWith(
      '/api/webmcp/plan',
      expect.objectContaining({
        body: expect.stringContaining('"provider":"openrouter"')
      })
    )
    const fetchOptions = (fetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1]
    expect(String(fetchOptions?.body)).toContain('"model":"nvidia/nemotron-3-super-120b-a12b:free"')
    expect(fetchOptions?.headers).not.toHaveProperty('Authorization')
  })

  it('renders slotted diagnostics inside an expandable row', async () => {
    const element = createCommandInputElement()
    const diagnostics = document.createElement('section')
    diagnostics.slot = 'diagnostics'
    diagnostics.textContent = 'Runtime diagnostics'
    element.append(diagnostics)

    document.body.append(element)
    await Promise.resolve()

    const diagnosticsRow =
      element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
    const diagnosticsSummary = element.shadowRoot?.querySelector<HTMLElement>(
      '.webmcp-disclosure-summary'
    )
    const diagnosticsSlot = element.shadowRoot?.querySelector<HTMLSlotElement>(
      'slot[name="diagnostics"]'
    )
    const status = element.shadowRoot?.querySelector<HTMLElement>(
      '.webmcp-settings-summary .webmcp-status'
    )
    expect(diagnosticsRow).toBeInstanceOf(HTMLDetailsElement)
    expect(diagnosticsSummary?.tagName).toBe('SUMMARY')
    expect(diagnosticsRow?.textContent).toContain('Developer diagnostics')
    expect(diagnosticsSlot?.assignedElements()).toEqual([diagnostics])
    expect(status).toBeNull()
  })

  it('renders floating mode as a panel controlled through the element API', async () => {
    const element = createCommandInputElement()
    element.setAttribute('floating', '')
    const panelToggleEvents: boolean[] = []
    element.addEventListener('webmcp-command-panel-toggle', function trackPanelToggle(event) {
      panelToggleEvents.push((event as CustomEvent<{ open: boolean }>).detail.open)
    })

    document.body.append(element)
    await Promise.resolve()

    const panel = element.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')
    expect(element.shadowRoot?.querySelector('.webmcp-floating-trigger')).toBeNull()
    expect(element.panelOpen).toBe(false)
    expect(panel?.hidden).toBe(true)
    expect(window.getComputedStyle(panel as Element).display).toBe('none')

    element.openPanel()

    const expandedPanel = element.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')
    const commandInput = getPromptInput(element)
    expect(element.panelOpen).toBe(true)
    expect(element.getAttribute('data-floating-expanded')).toBe('')
    expect(expandedPanel?.hidden).toBe(false)
    expect(window.getComputedStyle(expandedPanel as Element).display).not.toBe('none')
    expect(element.shadowRoot?.activeElement).toBe(commandInput)

    commandInput.blur()
    element.openPanel()

    expect(element.shadowRoot?.activeElement).toBe(commandInput)

    commandInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))

    const escapeClosedPanel =
      element.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')
    expect(element.panelOpen).toBe(false)
    expect(element.hasAttribute('data-floating-expanded')).toBe(false)
    expect(escapeClosedPanel?.hidden).toBe(true)
    expect(panelToggleEvents).toEqual([true, false])

    element.openPanel()

    element.togglePanel()

    const collapsedPanel = element.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')
    expect(element.panelOpen).toBe(false)
    expect(element.hasAttribute('data-floating-expanded')).toBe(false)
    expect(collapsedPanel?.hidden).toBe(true)
    expect(window.getComputedStyle(collapsedPanel as Element).display).toBe('none')
    expect(panelToggleEvents).toEqual([true, false, true, false])
  })

  it('keeps floating panel controls usable without a built-in trigger', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        },
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        }
      ]
    })
    const diagnostics = document.createElement('section')
    diagnostics.slot = 'diagnostics'
    diagnostics.textContent = 'Runtime diagnostics'
    element.append(diagnostics)
    element.setAttribute('floating', '')

    document.body.append(element)
    await Promise.resolve()
    element.openPanel()

    const settings = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
    const diagnosticsRow =
      element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')

    expect(element.shadowRoot?.querySelector('.webmcp-floating-trigger')).toBeNull()
    expect(settings).toBeInstanceOf(HTMLDetailsElement)
    expect(diagnosticsRow).toBeInstanceOf(HTMLDetailsElement)

    settings?.dispatchEvent(new Event('toggle'))
    diagnosticsRow?.dispatchEvent(new Event('toggle'))

    expect(element.panelOpen).toBe(true)
  })

  it('opens the floating panel when a command is run programmatically', async () => {
    setViewportSize(1200, 900)
    const element = createCommandInputElement()
    element.planner = {
      name: 'Test planner',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async plan() {
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
    registerTool(
      defineTool({
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
        execute(input) {
          return input
        }
      })
    )
    element.setAttribute('floating', '')

    document.body.append(element)
    await Promise.resolve()

    expect(element.panelOpen).toBe(false)

    await element.run('Find docks')

    expect(element.panelOpen).toBe(true)
    expect(element.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')?.hidden).toBe(
      false
    )
  })

  it('uses initial planner choices without locking the controls', async () => {
    const element = createCommandInputElement()
    document.body.append(element)

    element.configure({
      endpointOptions: [
        {
          label: 'Kimi K2.6',
          model: '@cf/moonshotai/kimi-k2.6',
          provider: 'cloudflare-binding'
        },
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        },
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        }
      ],
      initialModel: '@cf/moonshotai/kimi-k2.6',
      initialProvider: 'cloudflare-binding'
    })
    await Promise.resolve()

    const providerControl = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    const modelControl = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-model]')
    expect(providerControl?.value).toBe('cloudflare-binding')
    expect(modelControl?.value).toBe('@cf/moonshotai/kimi-k2.6')

    providerControl!.value = 'openrouter'
    providerControl!.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()

    expect(providerControl?.value).toBe('openrouter')
    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
  })

  it('preserves prompt focus and selection across configuration renders', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const input = getPromptInput(element)
    input.value = 'Find docks'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
    input.setSelectionRange(5, 10)

    element.configure({
      placeholder: 'Try a command'
    })
    await Promise.resolve()

    const renderedInput = getPromptInput(element)
    expect(element.shadowRoot?.activeElement).toBe(renderedInput)
    expect(renderedInput.value).toBe('Find docks')
    expect(renderedInput.selectionStart).toBe(5)
    expect(renderedInput.selectionEnd).toBe(10)
  })

  it('emits planner status when the selected provider changes', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        },
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()

    const event = waitForCommandPlanner(element)
    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    if (!provider) throw new Error('Expected provider control.')
    provider.value = 'openrouter'
    provider.dispatchEvent(new Event('change', { bubbles: true }))

    await expect(event).resolves.toMatchObject({
      detail: {
        planner: expect.objectContaining({
          name: 'OpenRouter',
          status: 'needs-key'
        })
      }
    })
  })

  it('keeps commands usable when selected Chrome built-in AI is unavailable', async () => {
    registerTool(
      defineTool({
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
      })
    )

    const element = createCommandInputElement()
    element.setAttribute('provider', 'chrome-built-in')
    document.body.append(element)
    await Promise.resolve()

    const result = await element.run('Add ten keyboards to the cart.')

    expect(result).toMatchObject({
      status: 'success',
      toolName: 'add_to_cart',
      output: {
        productId: 'Add ten keyboards to the cart.',
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

  it('selects a configured planner option through initialPlannerOptionId', async () => {
    registerTool(
      defineTool({
        name: 'select_items',
        description: 'Select checklist items.',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['ids'],
          additionalProperties: false
        },
        execute(input) {
          return input
        }
      })
    )
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'GPT-5.4 mini',
          model: 'gpt-5.4-mini',
          provider: 'openai'
        }
      ],
      initialPlannerOptionId: 'browser-local-ai',
      plannerOptions: [
        {
          id: 'browser-local-ai',
          label: 'Browser local AI',
          modelOptions: [
            {
              label: 'Hermes 3',
              model: 'hermes-3'
            },
            {
              label: 'Qwen 2B',
              model: 'qwen-2b'
            }
          ],
          createPlanner(options) {
            return {
              name: 'Browser local AI',
              available: true,
              status: 'ready',
              detail: `Runs ${options?.model ?? 'unknown'} in the browser.`,
              async plan() {
                return {
                  toolName: 'select_items',
                  input: { ids: [options?.model ?? 'missing-model'] },
                  confidence: 0.9,
                  reason: 'Selected with the initial consumer planner.'
                }
              }
            }
          }
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    const model = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-model]')
    const settings = element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')
    expect(provider?.value).toBe('planner:browser-local-ai')
    expect(model?.value).toBe('hermes-3')
    expect(settings?.open).toBe(false)

    await expect(element.run('Select items')).resolves.toMatchObject({
      status: 'success',
      output: { ids: ['hermes-3'] }
    })

    provider!.value = 'openai'
    provider!.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()

    const changedProvider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(changedProvider?.value).toBe('openai')
  })

  it('passes the selected model option object to createPlanner', async () => {
    const hermesModelOption = {
      label: 'Hermes 3',
      model: 'hermes-3',
      contextWindowSize: 8192
    }
    let receivedModelOption: unknown
    const createPlanner = vi.fn(function createPlannerSpy(
      options?: WebMCPCommandInputPlannerCreateOptions
    ): ToolPlanner {
      receivedModelOption = options?.modelOption

      return {
        name: 'Browser local AI',
        available: true,
        status: 'ready',
        detail: 'Browser planner.',
        async plan(): Promise<ToolPlan> {
          throw new Error('Not planned in this spec.')
        }
      }
    })
    const element = createCommandInputElement()
    element.configure({
      initialPlannerOptionId: 'browser-local-ai',
      plannerOptions: [
        {
          id: 'browser-local-ai',
          label: 'Browser local AI',
          modelOptions: [
            hermesModelOption,
            {
              label: 'Qwen 2B',
              model: 'qwen-2b'
            }
          ],
          createPlanner
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()
    await Promise.resolve()

    expect(createPlanner).toHaveBeenCalledWith({
      model: 'hermes-3',
      modelOption: hermesModelOption
    })
    expect(receivedModelOption).toBe(hermesModelOption)
  })

  it('ignores unknown initialPlannerOptionId values', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        },
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        }
      ],
      initialPlannerOptionId: 'missing-planner-option'
    })
    document.body.append(element)
    await Promise.resolve()

    const provider = element.shadowRoot?.querySelector<HTMLSelectElement>('[data-provider]')
    expect(provider?.value).toBe('openrouter')
  })

  it('ignores initialPlannerOptionId when the provider is fixed by the app', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpoint: '/api/webmcp/plan',
      model: 'gpt-5.4-mini',
      provider: 'openai',
      initialPlannerOptionId: 'browser-local-ai',
      plannerOptions: [
        {
          id: 'browser-local-ai',
          label: 'Browser local AI',
          createPlanner() {
            return {
              name: 'Browser local AI',
              available: true,
              status: 'ready',
              detail: 'Should not be selected.',
              async plan() {
                throw new Error('Should not plan.')
              }
            }
          }
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(element.provider).toBe('openai')
  })

  it('controls the settings disclosure through configure settingsOpen', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpointOptions: [
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        },
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        }
      ],
      settingsOpen: true
    })
    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')?.open).toBe(
      true
    )

    element.configure({ settingsOpen: false })

    expect(element.shadowRoot?.querySelector<HTMLDetailsElement>('.webmcp-settings')?.open).toBe(
      false
    )
  })

  it('commits configure() with a single render', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const observer = new MutationObserver(function ignoreMutations() {})
    observer.observe(element.shadowRoot as ShadowRoot, { childList: true })
    observer.takeRecords()

    element.configure({
      buttonLabel: 'Go',
      endpoint: '/api/webmcp/plan',
      endpointOptions: [
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        },
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        }
      ],
      floating: false,
      initialModel: 'nvidia/nemotron-3-super-120b-a12b:free',
      initialProvider: 'openrouter',
      placeholder: 'Try a command'
    })

    const records = observer.takeRecords()
    observer.disconnect()
    expect(records.length).toBe(1)
  })

  it('emits one planner status after a multi-option configure() call', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const plannerNames: string[] = []
    element.addEventListener('webmcp-command-planner', function trackPlanner(event) {
      plannerNames.push((event as CustomEvent<WebMCPCommandPlannerEventDetail>).detail.planner.name)
    })

    element.configure({
      endpoint: '/api/webmcp/plan',
      endpointOptions: [
        {
          label: 'Nemotron 3 Super 120B A12B',
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          provider: 'openrouter'
        },
        {
          label: 'GLM 4.7 Flash',
          model: '@cf/zai-org/glm-4.7-flash',
          provider: 'cloudflare-binding'
        }
      ],
      initialModel: 'nvidia/nemotron-3-super-120b-a12b:free',
      initialProvider: 'openrouter'
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(plannerNames).toEqual(['OpenRouter'])
  })

  it('does not show superseded planner refreshes after late configuration', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const event = waitForCommandPlanner(element)
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

    await expect(event).resolves.toMatchObject({
      detail: {
        planner: expect.objectContaining({
          name: 'Configured planner'
        })
      }
    })
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

function waitForCommandResult(
  element: WebMCPCommandInputElement
): Promise<CustomEvent<WebMCPCommandResultEventDetail>> {
  return new Promise(function resolveCommandResult(resolve) {
    element.addEventListener(
      'webmcp-command-result',
      function handleResult(event) {
        resolve(event as CustomEvent<WebMCPCommandResultEventDetail>)
      },
      { once: true }
    )
  })
}

function waitForCommandPlanner(
  element: WebMCPCommandInputElement
): Promise<CustomEvent<WebMCPCommandPlannerEventDetail>> {
  return new Promise(function resolveCommandPlanner(resolve) {
    element.addEventListener(
      'webmcp-command-planner',
      function handlePlanner(event) {
        resolve(event as CustomEvent<WebMCPCommandPlannerEventDetail>)
      },
      { once: true }
    )
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

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void
  const promise = new Promise<T>(function captureResolve(resolvePromise) {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve: function resolveDeferred(value: T) {
      resolve(value)
    }
  }
}
