import { describe, expect, it, vi } from 'vitest'

import { defineTool } from '../define-tool'
import type { RegisteredTool, ToolScopeResult } from '../interfaces/tool'
import { createToolCatalog, formatToolCatalogMarkdown } from './catalog'

describe('tool catalog adapter', () => {
  it('creates a serializable catalog from registered tools', () => {
    const catalog = createToolCatalog(
      [
        createRegistration({
          available: false,
          reason: 'Only available on the checkout page.'
        })
      ],
      {
        title: 'Demo Tools'
      }
    )

    expect(catalog).toEqual({
      title: 'Demo Tools',
      tools: [
        expect.objectContaining({
          name: 'add_to_cart',
          mode: 'fallback',
          available: false,
          unavailableReason: 'Only available on the checkout page.',
          examples: [
            {
              productId: 'kbd-01',
              quantity: 1
            }
          ]
        })
      ]
    })
  })

  it('returns detached schemas and confirmation metadata', () => {
    const handler = vi.fn(function approve() {
      return true
    })
    const registration = createRegistration()
    registration.tool.confirmation = { reason: registration.tool.confirmation!.reason, handler }
    registration.tool.outputSchema = {
      type: 'object',
      properties: { productId: { type: 'string' } }
    }
    const [entry] = createToolCatalog([registration]).tools
    if (!entry?.inputSchema.properties || !entry.outputSchema?.properties || !entry.confirmation) {
      throw new Error('Expected a catalog entry with schemas and confirmation.')
    }

    entry.inputSchema.properties.productId = { type: 'number' }
    entry.outputSchema.properties.productId = { type: 'number' }
    entry.confirmation.reason = 'Changed.'

    expect(registration.tool.inputSchema.properties?.productId).toEqual({ type: 'string' })
    const [next] = createToolCatalog([registration]).tools
    expect(next?.confirmation).toEqual({
      reason: 'Adding a product changes cart state.'
    })
    expect(next?.confirmation).not.toHaveProperty('handler')
    expect(next?.inputSchema.properties?.productId).toEqual({ type: 'string' })
    expect(next?.outputSchema?.properties?.productId).toEqual({ type: 'string' })
  })

  it('formats a Markdown catalog for docs and reviews', () => {
    const markdown = formatToolCatalogMarkdown(
      createToolCatalog([createRegistration()], {
        title: 'Demo Tools'
      })
    )

    expect(markdown).toContain('# Demo Tools')
    expect(markdown).toContain('## add_to_cart')
    expect(markdown).toContain('- Confirmation: Adding a product changes cart state.')
    expect(markdown).toContain('"productId"')
  })

  it('marks a failing scope unavailable without losing the rest of the catalog', function test() {
    const registration = createRegistration()
    registration.tool.scope = function unavailable() {
      throw new Error('Document closed')
    }
    expect(
      createToolCatalog([registration, createRegistration()]).tools.map(function state(tool) {
        return tool.available
      })
    ).toEqual([false, true])
  })
})

function createRegistration(
  scopeResult: ToolScopeResult = { available: true }
): RegisteredTool<
  { productId: string; quantity: number },
  { productId: string; quantity: number }
> {
  const tool = defineTool({
    name: 'add_to_cart',
    description: 'Add a known product to the cart for the current shopping session.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string'
        },
        quantity: {
          type: 'number',
          minimum: 1
        }
      },
      required: ['productId', 'quantity']
    },
    confirmation: {
      reason: 'Adding a product changes cart state.'
    },
    examples: [
      {
        productId: 'kbd-01',
        quantity: 1
      }
    ],
    scope() {
      return scopeResult
    },
    execute(input) {
      return input
    }
  })

  return {
    tool,
    mode: 'fallback',
    warnings: [],
    ready: Promise.resolve(),
    unregister() {}
  }
}
