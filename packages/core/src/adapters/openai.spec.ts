import { describe, expect, it } from 'vitest'

import { defineTool } from '../define-tool'
import { formatOpenAITool, formatOpenAITools } from './openai'

describe('OpenAI adapter', () => {
  it('formats a WebMCP tool as an OpenAI function tool', () => {
    const tool = defineTool({
      name: 'create_invoice',
      description: 'Create a draft invoice for a customer and add it to the local invoice list.',
      inputSchema: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Customer name'
          },
          amount: {
            type: 'number',
            minimum: 0.01,
            description: 'Invoice amount'
          }
        },
        required: ['customerName', 'amount']
      },
      execute(input) {
        return input
      }
    })

    expect(formatOpenAITool(tool)).toEqual({
      type: 'function',
      function: {
        name: 'create_invoice',
        description: 'Create a draft invoice for a customer and add it to the local invoice list.',
        parameters: {
          type: 'object',
          properties: {
            customerName: {
              type: 'string',
              description: 'Customer name'
            },
            amount: {
              type: 'number',
              minimum: 0.01,
              description: 'Invoice amount'
            }
          },
          required: ['customerName', 'amount'],
          additionalProperties: false
        }
      }
    })
  })

  it('formats a list of tools', () => {
    const tool = defineTool({
      name: 'search_products',
      description: 'Search the local product catalog for items matching the current shopper request.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        }
      },
      execute(input) {
        return input
      }
    })

    expect(formatOpenAITools([tool])).toHaveLength(1)
  })
})
