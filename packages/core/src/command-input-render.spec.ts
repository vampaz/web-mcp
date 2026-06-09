import { describe, expect, it } from 'vitest'

import { defineWebMCPCommandInput } from './command-input'
import { defineTool } from './define-tool'
import type { WebMCPCommandInputElement } from './interfaces/command-input'
import type { ToolPlan } from './interfaces/tool'
import { clearToolsForTest, registerTool } from './registry'

let tagCounter = 0

const multiProviderEndpointOptions = [
  {
    label: 'Nemotron 3 Super 120B A12B',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    provider: 'openrouter' as const
  },
  {
    label: 'Nemotron Nano 9B V2',
    model: 'nvidia/nemotron-nano-9b-v2:free',
    provider: 'openrouter' as const
  },
  {
    label: 'GLM 4.7 Flash',
    model: '@cf/zai-org/glm-4.7-flash',
    provider: 'cloudflare-binding' as const
  }
]

describe('WebMCP command input rendering', () => {
  it('renders the default inline layout', async () => {
    const element = createRenderedElement()
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders provider and model controls for endpoint options', async () => {
    const element = createRenderedElement()
    element.configure({
      endpointOptions: multiProviderEndpointOptions
    })
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders a selected planner option with open settings', async () => {
    const element = createRenderedElement()
    element.configure({
      endpointOptions: multiProviderEndpointOptions,
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
          createPlanner() {
            return {
              name: 'Browser local AI',
              available: true,
              status: 'ready',
              detail: 'Browser planner.',
              async plan() {
                throw new Error('Not planned in render specs.')
              }
            }
          }
        }
      ],
      settingsOpen: true
    })
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders slotted diagnostics', async () => {
    const element = createRenderedElement()
    const diagnostics = document.createElement('section')
    diagnostics.slot = 'diagnostics'
    diagnostics.textContent = 'Runtime diagnostics'
    element.append(diagnostics)
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders floating mode collapsed and expanded', async () => {
    const element = createRenderedElement()
    element.setAttribute('floating', '')
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()

    element.openPanel()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders fixed provider and model without controls', async () => {
    const element = createRenderedElement()
    element.configure({
      endpoint: '/api/webmcp/plan',
      model: 'gpt-5.4-mini',
      provider: 'openai'
    })
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders the planning phase button state', async () => {
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
    let resolvePlan: ((plan: ToolPlan) => void) | undefined
    const element = createRenderedElement()
    element.planner = {
      name: 'Slow planner',
      available: true,
      status: 'ready',
      detail: 'Planning in progress.',
      plan() {
        return new Promise<ToolPlan>(function capturePlanResolve(resolve) {
          resolvePlan = resolve
        })
      }
    }
    document.body.append(element)
    await Promise.resolve()

    const running = element.run('Find docks')
    await Promise.resolve()
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()

    resolvePlan?.({
      toolName: 'search_products',
      input: { query: 'dock' },
      confidence: 0.9,
      reason: 'Matched product search.'
    })
    await running
    clearToolsForTest()
    element.remove()
  })
})

function createRenderedElement(): WebMCPCommandInputElement {
  const tagName = `webmcp-command-input-render-${tagCounter++}`
  defineWebMCPCommandInput(tagName)
  return document.createElement(tagName) as WebMCPCommandInputElement
}

function serializeShadow(element: WebMCPCommandInputElement): string {
  const html = element.shadowRoot?.innerHTML ?? ''
  return html
    .replace(/<style>[\s\S]*?<\/style>/, '<style>(styles)</style>')
    .replace(/>\s+/g, '>')
    .replace(/\s+</g, '<')
    .replace(/\s+/g, ' ')
    .trim()
}
