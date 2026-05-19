import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineWebMCPCommandInput } from './command-input'
import { defineTool } from './define-tool'
import type { WebMCPCommandInputElement, WebMCPCommandResultEventDetail } from './interfaces/command-input'
import type { ToolPlanner } from './interfaces/tool'
import { clearToolsForTest, registerTool } from './registry'

let tagCounter = 0

describe('WebMCP command input', () => {
  afterEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
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
    element.setAttribute('model', 'gpt-4.1-mini')
    element.setAttribute('endpoint', '/api/webmcp/plan')

    document.body.append(element)
    await Promise.resolve()

    expect(element.shadowRoot?.querySelector('[data-provider]')).toBeNull()
    expect(element.shadowRoot?.querySelector('[data-model]')).toBeNull()
  })

  it('restores provider controls when a fixed provider attribute is removed', async () => {
    const element = createCommandInputElement()
    element.setAttribute('provider', 'openai')
    element.setAttribute('model', 'gpt-4.1-mini')

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

    const model = element.shadowRoot?.querySelector<HTMLInputElement>('[data-model]')
    expect(model).toBeInstanceOf(HTMLInputElement)
    expect(model?.value).toBe('gpt-4.1-mini')
  })

  it('hides controls when provider and model are fixed through configure', async () => {
    const element = createCommandInputElement()
    element.configure({
      endpoint: '/api/webmcp/plan',
      model: 'gpt-4.1-mini',
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
