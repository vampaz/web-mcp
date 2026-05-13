import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearToolsForTest, defineTool, registerTool } from '@webmcp-kit/core'

import { createLocalMCPBridge } from './index'

describe('local MCP bridge', () => {
  beforeEach(() => {
    clearToolsForTest()
  })

  afterEach(() => {
    clearToolsForTest()
  })

  it('lists and invokes fallback-registered tools with MCP-style requests', async () => {
    registerTool(defineTool({
      name: 'search_products',
      description: 'Search the local product catalog for items matching the current shopper request.',
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
    }))

    const bridge = createLocalMCPBridge()

    expect(bridge.listTools()).toEqual([
      {
        name: 'search_products',
        description: 'Search the local product catalog for items matching the current shopper request.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      }
    ])

    await expect(bridge.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    })).resolves.toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: bridge.listTools()
      }
    })

    await expect(bridge.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'search_products',
        arguments: {
          query: 'keyboard'
        }
      }
    })).resolves.toEqual({
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
})
