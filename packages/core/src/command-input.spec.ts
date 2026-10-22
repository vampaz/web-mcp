import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineWebMCPCommandInput } from './command-input'
import { defineTool } from './define-tool'
import type {
  WebMCPCommandInputElement,
  WebMCPCommandInputResolverCreateOptions,
  WebMCPCommandResolverEventDetail,
  WebMCPCommandResultEventDetail,
  WebMCPCommandStepEventDetail
} from './interfaces/command-input'
import type { ToolResolution, ToolResolver } from './interfaces/tool'
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

  it('resolves a command and invokes the selected registered tool', async () => {
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

    const resolver: ToolResolver = {
      name: 'Test resolver',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async resolve(message, tools, context) {
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
    element.resolver = resolver
    element.context = function getResolverContext() {
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
        source: 'resolver',
        signal: expect.any(AbortSignal)
      }
    )
  })

  it('returns resolver outcomes without invoking a registered tool', async () => {
    const resolver: ToolResolver = {
      name: 'Outcome resolver',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async resolve() {
        return {
          toolName: 'no_tools_match',
          input: {},
          confidence: 0,
          reason: 'No tool can satisfy this command.'
        }
      }
    }
    const element = createCommandInputElement()
    element.resolver = resolver

    document.body.append(element)
    await Promise.resolve()

    await expect(element.run('Send the weekly report')).resolves.toMatchObject({
      toolName: 'no_tools_match',
      status: 'unavailable',
      error: 'No tool can satisfy this command.'
    })
  })

  it('does not send scope-unavailable tools to the resolver', async () => {
    registerTool(
      defineTool({
        name: 'checkout_cart',
        description: 'Checkout the current cart after the user reviews the order.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        scope() {
          return { available: false, reason: 'Cart is empty.' }
        },
        execute() {
          return { checkedOut: true }
        }
      })
    )

    const resolver: ToolResolver = {
      name: 'Scope-aware resolver',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async resolve(_message, tools) {
        expect(tools).toEqual([])
        return {
          toolName: 'no_tools_match',
          input: {},
          confidence: 0,
          reason: 'No available tools.'
        }
      }
    }
    const element = createCommandInputElement()
    element.resolver = resolver
    document.body.append(element)
    await Promise.resolve()

    await expect(element.run('Checkout')).resolves.toMatchObject({
      toolName: 'no_tools_match',
      status: 'unavailable'
    })
  })

  it('marks the run button as resolving while the resolver is working', async () => {
    const resolutionRequest = createDeferred<ToolResolution>()
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

    const resolver: ToolResolver = {
      name: 'Slow resolver',
      available: true,
      status: 'ready',
      detail: 'Resolving in progress.',
      async resolve() {
        return await resolutionRequest.promise
      }
    }
    const element = createCommandInputElement()
    element.resolver = resolver
    document.body.append(element)
    await Promise.resolve()

    const result = element.run('Find docks')
    await Promise.resolve()
    await Promise.resolve()

    const button = element.shadowRoot?.querySelector<HTMLButtonElement>('.webmcp-run-button')
    expect(button?.dataset.phase).toBe('resolving')
    expect(button?.textContent).toBe('Stop')
    expect(button?.disabled).toBe(false)
    expect(element.shadowRoot?.querySelector('[role="status"]')?.textContent).toBe('Resolving...')

    resolutionRequest.resolve({
      toolName: 'search_products',
      input: {
        query: 'dock'
      },
      confidence: 0.9,
      reason: 'Matched product search.'
    })
    await result
  })

  it('emits progress events for resolved tool sequences', async () => {
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

    const resolver: ToolResolver = {
      name: 'Sequence resolver',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async resolve() {
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
    element.resolver = resolver
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

  it('cancels a command before resolving starts', async () => {
    const resolve = vi.fn(async function createResolution() {
      return {
        toolName: 'search_products',
        input: { query: 'dock' },
        confidence: 0.9,
        reason: 'Should not run.'
      }
    })
    const resolver: ToolResolver = {
      name: 'Test resolver',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      resolve
    }
    const controller = new AbortController()
    const element = createCommandInputElement()
    element.resolver = resolver
    document.body.append(element)
    await Promise.resolve()
    controller.abort()

    await expect(element.run('Find docks', { signal: controller.signal })).resolves.toMatchObject({
      status: 'error',
      error: 'Command was cancelled.'
    })
    expect(resolve).not.toHaveBeenCalled()
  })

  it.each(['disconnect', 'reconfigure'] as const)(
    'does not execute a late resolution after %s',
    async function test(action) {
      let finish!: (resolution: ToolResolution) => void
      const execute = vi.fn()
      registerTool(
        defineTool({
          name: 'read_items',
          description: 'Read visible items.',
          inputSchema: { type: 'object' },
          execute
        })
      )
      const element = createCommandInputElement()
      element.resolver = {
        name: 'Pending resolver',
        available: true,
        status: 'ready',
        detail: 'Pending',
        resolve: vi.fn(function pending() {
          return new Promise<ToolResolution>(function wait(resolve) {
            finish = resolve
          })
        })
      }
      document.body.append(element)
      const pending = element.run('Read items')
      await vi.waitFor(function resolving() {
        expect(finish).toBeTypeOf('function')
      })
      if (action === 'disconnect') element.remove()
      else element.configure({ resolver: undefined })
      finish({ toolName: 'read_items', input: {}, confidence: 1, reason: 'Read' })
      expect(await pending).toMatchObject({ status: 'error', error: 'Command was cancelled.' })
      expect(execute).not.toHaveBeenCalled()
    }
  )

  it('does not render resolver controls without consumer endpoint options', async () => {
    const element = createCommandInputElement()

    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(element.shadowRoot?.querySelector('.webmcp-settings')).toBeNull()
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

  it('opens the floating panel when a command is run programmatically', async () => {
    setViewportSize(1200, 900)
    const element = createCommandInputElement()
    element.resolver = {
      name: 'Test resolver',
      available: true,
      status: 'ready',
      detail: 'Ready for tests.',
      async resolve() {
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

  it('passes the selected model option object to createResolver', async () => {
    const hermesModelOption = {
      label: 'Hermes 3',
      model: 'hermes-3',
      contextWindowSize: 8192
    }
    let receivedModelOption: unknown
    const createResolver = vi.fn(function createResolverSpy(
      options?: WebMCPCommandInputResolverCreateOptions
    ): ToolResolver {
      receivedModelOption = options?.modelOption

      return {
        name: 'Browser local AI',
        available: true,
        status: 'ready',
        detail: 'Browser resolver.',
        async resolve(): Promise<ToolResolution> {
          throw new Error('Not resolved in this spec.')
        }
      }
    })
    const element = createCommandInputElement()
    element.configure({
      initialResolverOptionId: 'browser-local-ai',
      resolverOptions: [
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
          createResolver
        }
      ]
    })
    document.body.append(element)
    await Promise.resolve()
    await Promise.resolve()

    expect(createResolver).toHaveBeenCalledWith({
      model: 'hermes-3',
      modelOption: hermesModelOption
    })
    expect(receivedModelOption).toBe(hermesModelOption)
  })

  it('does not show superseded resolver refreshes after late configuration', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const event = waitForCommandResolver(element)
    element.configure({
      resolver: {
        name: 'Configured resolver',
        available: true,
        status: 'ready',
        detail: 'Configured after mount.',
        async resolve() {
          return {
            toolName: 'search_products',
            input: {},
            confidence: 0.5,
            reason: 'Test resolver.'
          }
        }
      }
    })
    await Promise.resolve()
    await Promise.resolve()

    await expect(event).resolves.toMatchObject({
      detail: {
        resolver: expect.objectContaining({
          name: 'Configured resolver'
        })
      }
    })
    expect(element.shadowRoot?.textContent).not.toContain('superseded')
  })
})

describe('WebMCP command input controls', () => {
  afterEach(() => {
    clearToolsForTest()
    delete (window as WindowWithLanguageModel).LanguageModel
    document.body.innerHTML = ''
  })

  it('turns the run button into a stable Stop control that cancels the command', async () => {
    const element = createCommandInputElement()
    const pending = createPendingResolver()
    element.resolver = pending.resolver
    document.body.append(element)
    await Promise.resolve()

    const button = getRunButton(element)
    button.focus()
    const running = element.run('Read items')
    await vi.waitFor(function resolving() {
      expect(pending.signal).toBeInstanceOf(AbortSignal)
    })

    expect(button.textContent).toBe('Stop')
    expect(button.type).toBe('button')
    expect(element.shadowRoot?.activeElement).toBe(button)
    button.click()

    expect(pending.signal?.aborted).toBe(true)
    await expect(running).resolves.toMatchObject({
      status: 'error',
      code: 'cancelled',
      error: 'Command was cancelled.'
    })
    expect(getRunButton(element)).toBe(button)
    expect(button.textContent).toBe('Run')
    expect(button.type).toBe('submit')
    expect(element.shadowRoot?.activeElement).toBe(button)
    expect(getFeedback(element).dataset.tone).toBe('info')
  })

  it('uses Escape to stop a running command before closing the floating panel', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    const element = createCommandInputElement()
    const pending = createPendingResolver()
    element.resolver = pending.resolver
    element.floating = true
    document.body.append(element)
    await Promise.resolve()

    opener.focus()
    const running = element.run('Read items')
    await vi.waitFor(function resolving() {
      expect(pending.signal).toBeInstanceOf(AbortSignal)
    })
    const input = getPromptInput(element)
    expect(element.shadowRoot?.activeElement).toBe(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    expect(pending.signal?.aborted).toBe(true)
    expect(element.panelOpen).toBe(true)
    await expect(running).resolves.toMatchObject({ code: 'cancelled' })

    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    expect(element.panelOpen).toBe(false)
    expect(document.activeElement).toBe(opener)
  })

  it('renders a launcher that toggles the floating panel and receives focus on close', async () => {
    const element = createCommandInputElement()
    element.configure({ floating: true, launcher: true, labels: { launcher: 'Ask' } })
    document.body.append(element)
    await Promise.resolve()

    const launcher = element.shadowRoot?.querySelector<HTMLButtonElement>('[part="launcher"]')
    const panel = element.shadowRoot?.querySelector<HTMLElement>('[part="panel"]')
    if (!launcher || !panel) throw new Error('Expected launcher and panel.')
    expect(launcher.textContent).toBe('Ask')
    expect(launcher.getAttribute('aria-controls')).toBe(panel.id)
    expect(launcher.getAttribute('aria-expanded')).toBe('false')
    expect(element.hasAttribute('launcher')).toBe(true)

    launcher.focus()
    launcher.click()
    expect(element.panelOpen).toBe(true)
    expect(launcher.getAttribute('aria-expanded')).toBe('true')
    expect(element.shadowRoot?.activeElement).toBe(getPromptInput(element))

    getPromptInput(element).dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    )
    expect(element.panelOpen).toBe(false)
    expect(launcher.getAttribute('aria-expanded')).toBe('false')
    expect(element.shadowRoot?.activeElement).toBe(launcher)

    element.floating = false
    expect(element.shadowRoot?.querySelector('[part="launcher"]')).toBeNull()
  })

  it('applies the field label and custom labels without renaming the button during a run', async () => {
    const element = createCommandInputElement()
    const pending = createPendingResolver()
    element.setAttribute('label', 'Ask the catalog')
    element.labels = { run: 'Go', stop: 'Halt', resolving: 'Thinking', form: 'Catalog commands' }
    element.resolver = pending.resolver
    document.body.append(element)
    await Promise.resolve()

    const input = getPromptInput(element)
    expect(input.closest('label')?.textContent?.trim()).toBe('Ask the catalog')
    expect(input.getAttribute('part')).toBe('input')
    expect(getPromptForm(element).getAttribute('aria-label')).toBe('Catalog commands')
    expect(getRunButton(element).textContent).toBe('Go')
    expect(element.labels.provider).toBe('Provider')

    const running = element.run('Read items')
    await vi.waitFor(function resolving() {
      expect(pending.signal).toBeInstanceOf(AbortSignal)
    })
    expect(getRunButton(element).textContent).toBe('Halt')
    expect(getFeedback(element).textContent).toBe('Thinking')
    pending.finish({ toolName: 'needs_clarification', input: {}, confidence: 0, reason: 'Which?' })
    await running
    expect(getRunButton(element).textContent).toBe('Go')

    element.removeAttribute('label')
    expect(input.closest('label')?.textContent?.trim()).toBe('Command')
  })

  it('exposes stable parts and keeps the same nodes across structural changes', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    const input = getPromptInput(element)
    input.focus()
    element.configure({
      resolverOptions: [
        {
          id: 'first',
          label: 'First',
          modelOptions: [
            { label: 'Small', model: 'small' },
            { label: 'Large', model: 'large' }
          ],
          createResolver: createReadyResolver
        },
        { id: 'second', label: 'Second', createResolver: createReadyResolver }
      ]
    })
    element.floating = true
    element.openPanel()

    expect(getPromptInput(element)).toBe(input)
    expect(element.shadowRoot?.activeElement).toBe(input)
    expect(element.shadowRoot?.querySelector('[data-provider]')).not.toBeNull()
    for (const part of ['panel', 'form', 'input', 'run', 'feedback']) {
      expect(element.shadowRoot?.querySelector(`[part="${part}"]`)).not.toBeNull()
    }
  })

  it('reflects disabled and floating to attributes', async () => {
    const element = createCommandInputElement()
    document.body.append(element)
    await Promise.resolve()

    element.disabled = true
    element.floating = true
    expect(element.hasAttribute('disabled')).toBe(true)
    expect(element.hasAttribute('floating')).toBe(true)
    expect(getPromptInput(element).disabled).toBe(true)
    expect(getRunButton(element).getAttribute('aria-disabled')).toBe('true')
    await expect(element.run('Read items')).resolves.toBeUndefined()

    element.configure({ disabled: false, floating: false })
    expect(element.hasAttribute('disabled')).toBe(false)
    expect(element.hasAttribute('floating')).toBe(false)
    expect(getRunButton(element).hasAttribute('aria-disabled')).toBe(false)
  })

  it('applies properties that were set before the element was defined', async () => {
    const tagName = `webmcp-command-input-test-${tagCounter++}`
    const element = document.createElement(tagName) as WebMCPCommandInputElement
    const resolver = createReadyResolver()
    const context = { route: 'catalog' }
    Object.assign(element, { context, floating: true, label: 'Early', resolver })
    document.body.append(element)

    defineWebMCPCommandInput(tagName)
    await Promise.resolve()

    expect(element.resolver).toBe(resolver)
    expect(element.context).toBe(context)
    expect(element.hasAttribute('floating')).toBe(true)
    expect(getPromptInput(element).closest('label')?.textContent?.trim()).toBe('Early')
  })

  it('keeps a command running when the element moves in the DOM', async () => {
    registerTool(createReadTool())
    const element = createCommandInputElement()
    const pending = createPendingResolver()
    element.resolver = pending.resolver
    document.body.append(element)
    const running = element.run('Read items')
    await vi.waitFor(function resolving() {
      expect(pending.signal).toBeInstanceOf(AbortSignal)
    })

    const container = document.createElement('div')
    document.body.append(container)
    container.append(element)
    await Promise.resolve()

    expect(pending.signal?.aborted).toBe(false)
    pending.finish({ toolName: 'read_items', input: {}, confidence: 1, reason: 'Read' })
    await expect(running).resolves.toMatchObject({ status: 'success' })
  })

  it('keeps a running command when resolver options are rebuilt with equal choices', async () => {
    const element = createCommandInputElement()
    const pending = createPendingResolver()
    function create() {
      return pending.resolver
    }
    function choices() {
      return [
        { id: 'only', label: 'Only', modelOptions: [{ label: 'M', model: 'm' }], create }
      ].map(function toOption(choice) {
        return {
          id: choice.id,
          label: choice.label,
          modelOptions: choice.modelOptions,
          createResolver: choice.create
        }
      })
    }
    element.configure({ resolverOptions: choices() })
    document.body.append(element)
    const running = element.run('Read items')
    await vi.waitFor(function resolving() {
      expect(pending.signal).toBeInstanceOf(AbortSignal)
    })

    element.configure({ resolverOptions: choices() })
    expect(pending.signal?.aborted).toBe(false)

    element.configure({
      resolverOptions: [{ ...choices()[0]!, createResolver: createReadyResolver }]
    })
    expect(pending.signal?.aborted).toBe(true)
    await expect(running).resolves.toMatchObject({ code: 'cancelled' })
  })

  it('reports resolver failures with a resolver_failed code', async () => {
    const element = createCommandInputElement()
    element.resolver = {
      ...createReadyResolver(),
      async resolve() {
        throw new Error('Provider is offline')
      }
    }
    document.body.append(element)

    await expect(element.run('Read items')).resolves.toMatchObject({
      status: 'error',
      code: 'resolver_failed',
      error: 'Provider is offline'
    })
    expect(getFeedback(element).dataset.tone).toBe('error')
  })

  it.each([
    ['available', 1],
    ['unavailable', 3]
  ] as const)(
    'recreates the automatic resolver before a run only when it is not ready (%s)',
    async function test(availability, expectedChecks) {
      const check = vi.fn(async function check() {
        return availability
      })
      ;(window as WindowWithLanguageModel).LanguageModel = {
        availability: check,
        async create() {
          throw new Error('Not used by this spec.')
        }
      }
      const element = createCommandInputElement()
      document.body.append(element)
      await vi.waitFor(function created() {
        expect(check).toHaveBeenCalledOnce()
      })

      await element.run('Read items')
      await element.run('Read items')

      expect(check).toHaveBeenCalledTimes(expectedChecks)
    }
  )
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

function getRunButton(element: WebMCPCommandInputElement): HTMLButtonElement {
  const button = element.shadowRoot?.querySelector<HTMLButtonElement>('[part="run"]')
  if (!button) throw new Error('Expected run button.')
  return button
}

function getFeedback(element: WebMCPCommandInputElement): HTMLElement {
  const feedback = element.shadowRoot?.querySelector<HTMLElement>('[part="feedback"]')
  if (!feedback) throw new Error('Expected feedback.')
  return feedback
}

function createReadyResolver(): ToolResolver {
  return {
    name: 'Ready resolver',
    available: true,
    status: 'ready',
    detail: 'Ready for tests.',
    async resolve() {
      return { toolName: 'no_tools_match', input: {}, confidence: 0, reason: 'No match.' }
    }
  }
}

function createPendingResolver(): {
  finish: (resolution: ToolResolution) => void
  resolver: ToolResolver
  readonly signal: AbortSignal | undefined
} {
  let finish: ((resolution: ToolResolution) => void) | undefined
  let signal: AbortSignal | undefined
  return {
    finish(resolution) {
      if (!finish) throw new Error('Resolver has not started.')
      finish(resolution)
    },
    resolver: {
      name: 'Pending resolver',
      available: true,
      status: 'ready',
      detail: 'Pending.',
      resolve(_message, _tools, _context, options) {
        signal = options?.signal
        return new Promise<ToolResolution>(function wait(resolve) {
          finish = resolve
        })
      }
    },
    get signal() {
      return signal
    }
  }
}

function createReadTool() {
  return defineTool({
    name: 'read_items',
    description: 'Read visible items.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute() {
      return { items: [] }
    }
  })
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

function waitForCommandResolver(
  element: WebMCPCommandInputElement
): Promise<CustomEvent<WebMCPCommandResolverEventDetail>> {
  return new Promise(function resolveCommandResolver(resolve) {
    element.addEventListener(
      'webmcp-command-resolver',
      function handleResolver(event) {
        resolve(event as CustomEvent<WebMCPCommandResolverEventDetail>)
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
