import { describe, expect, it } from 'vitest'

import { defineWebMCPCommandInput } from './command-input'
import { defineTool } from './define-tool'
import type { WebMCPCommandInputElement } from './interfaces/command-input'
import type { ToolResolution } from './interfaces/tool'
import { clearToolsForTest, registerTool } from './registry'

let tagCounter = 0

const resolverChoices = [
  {
    id: 'first',
    label: 'First provider',
    modelOptions: [
      { label: 'Small', model: 'small' },
      { label: 'Large', model: 'large' }
    ],
    createResolver: resolver
  },
  { id: 'second', label: 'Second provider', createResolver: resolver }
]

function resolver() {
  return {
    name: 'Fixture resolver',
    available: true,
    status: 'ready' as const,
    detail: 'Ready.',
    async resolve(): Promise<ToolResolution> {
      throw new Error('Not used by rendering tests.')
    }
  }
}

describe('WebMCP command input rendering', () => {
  it('renders the default inline layout', async () => {
    const element = createRenderedElement()
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders provider and model controls for resolver choices', async () => {
    const element = createRenderedElement()
    element.configure({
      resolverOptions: resolverChoices
    })
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders a selected resolver option with open settings', async () => {
    const element = createRenderedElement()
    element.configure({
      initialResolverOptionId: 'browser-local-ai',
      resolverOptions: [
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
          createResolver() {
            return {
              name: 'Browser local AI',
              available: true,
              status: 'ready',
              detail: 'Browser resolver.',
              async resolve() {
                throw new Error('Not resolved in render specs.')
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
      resolver: resolver()
    })
    document.body.append(element)
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()
    element.remove()
  })

  it('renders the resolving phase button state', async () => {
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
    let resolveResolution: ((resolution: ToolResolution) => void) | undefined
    const element = createRenderedElement()
    element.resolver = {
      name: 'Slow resolver',
      available: true,
      status: 'ready',
      detail: 'Resolving in progress.',
      resolve() {
        return new Promise<ToolResolution>(function captureResolutionResolve(resolve) {
          resolveResolution = resolve
        })
      }
    }
    document.body.append(element)
    await Promise.resolve()

    const running = element.run('Find docks')
    await Promise.resolve()
    await Promise.resolve()

    expect(serializeShadow(element)).toMatchSnapshot()

    resolveResolution?.({
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
