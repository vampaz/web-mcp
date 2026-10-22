import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import { defineTool, registerTool, setConfirmationHandler } from '@vampaz/webmcp-kit'

import { createLocalMCPBridge } from './index'

describe('local MCP bridge', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
  })

  afterEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
  })

  it('lists and invokes fallback-registered tools with MCP-style requests', async () => {
    registerTool(
      defineTool({
        name: 'search_products',
        description:
          'Search the local product catalog for items matching the current shopper request.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        },
        execute(input) {
          return {
            matches: [input.query]
          }
        }
      })
    )

    const bridge = createLocalMCPBridge()

    expect(bridge.listTools()).toEqual([
      {
        name: 'search_products',
        description:
          'Search the local product catalog for items matching the current shopper request.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      }
    ])

    await expect(
      bridge.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      })
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: bridge.listTools()
      }
    })

    await expect(
      bridge.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'search_products',
          arguments: {
            query: 'keyboard'
          }
        }
      })
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ matches: ['keyboard'] })
          }
        ],
        isError: false
      }
    })
  })

  it('lists only tools that are currently available', () => {
    let cartOpen = false
    registerTool(
      defineTool({
        name: 'search_products',
        description: 'Search the local product catalog.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute() {
          return []
        }
      })
    )
    registerTool(
      defineTool({
        name: 'checkout_cart',
        description: 'Checkout the open cart.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        scope() {
          return { available: cartOpen, reason: 'Open the cart first.' }
        },
        execute() {
          return { ok: true }
        }
      })
    )
    const bridge = createLocalMCPBridge()

    expect(bridge.listTools().map((tool) => tool.name)).toEqual(['search_products'])

    cartOpen = true
    expect(bridge.listTools().map((tool) => tool.name)).toEqual([
      'search_products',
      'checkout_cart'
    ])
  })

  it('includes output schemas and annotations only when the tool defines them', () => {
    const outputSchema = {
      type: 'object',
      properties: { matches: { type: 'array', items: { type: 'string' } } },
      required: ['matches'],
      additionalProperties: false
    }
    registerTool(
      defineTool({
        name: 'search_products',
        description: 'Search the local product catalog.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        outputSchema,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute() {
          return { matches: [] }
        }
      })
    )
    registerTool(
      defineTool({
        name: 'clear_cart',
        description: 'Clear every line from the cart.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute() {
          return { ok: true }
        }
      })
    )

    expect(createLocalMCPBridge().listTools()).toStrictEqual([
      {
        name: 'search_products',
        description: 'Search the local product catalog.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        outputSchema,
        annotations: { readOnlyHint: true, untrustedContentHint: true }
      },
      {
        name: 'clear_cart',
        description: 'Clear every line from the cart.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      }
    ])
  })

  it('tags tool calls with the mcp-bridge source', async () => {
    const execute = vi.fn(function readCart() {
      return { lines: 0 }
    })
    registerTool(
      defineTool({
        name: 'read_cart',
        description: 'Read the current cart.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute
      })
    )

    await expect(createLocalMCPBridge().callTool('read_cart', {})).resolves.toMatchObject({
      status: 'success',
      output: { lines: 0 }
    })
    expect(execute).toHaveBeenCalledWith({}, { source: 'mcp-bridge' })
  })

  it('requires explicit confirmation for confirmed tools', async () => {
    setConfirmationHandler(function rejectConfirmation() {
      return false
    })

    registerTool(
      defineTool({
        name: 'checkout_cart',
        description:
          'Checkout the current cart and clear all cart lines after explicit confirmation.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        confirmation: {
          reason: 'Checkout clears the cart.'
        },
        execute() {
          return {
            ok: true
          }
        }
      })
    )

    const bridge = createLocalMCPBridge()

    await expect(
      bridge.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'checkout_cart',
          arguments: {}
        }
      })
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify('Checkout clears the cart.')
          }
        ],
        isError: true
      }
    })

    await expect(
      bridge.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'checkout_cart',
          arguments: {},
          confirmed: true
        }
      })
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify('Checkout clears the cart.')
          }
        ],
        isError: true
      }
    })
  })
})

it('returns structured content for tools that declare an output schema', async () => {
  clearToolsForTest()
  registerTool(
    defineTool({
      name: 'read_total',
      description: 'Read the current invoice total for the open workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { total: { type: 'number' } },
        required: ['total']
      },
      execute() {
        return { total: 42 }
      }
    })
  )

  const response = await createLocalMCPBridge().handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'read_total', arguments: {} }
  })

  expect(response.result).toMatchObject({ structuredContent: { total: 42 }, isError: false })
  clearToolsForTest()
})

it('returns structured content for any schema-valid output, even if the tool unregisters itself', async () => {
  clearToolsForTest()
  const counter = registerTool(
    defineTool({
      name: 'read_count',
      description: 'Read the current item count for the open workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'integer' },
      execute() {
        counter.unregister()
        return 3
      }
    })
  )

  const response = await createLocalMCPBridge().handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'read_count', arguments: {} }
  })

  expect(response.result).toMatchObject({
    content: [{ type: 'text', text: '3' }],
    structuredContent: 3,
    isError: false
  })
  clearToolsForTest()
})
