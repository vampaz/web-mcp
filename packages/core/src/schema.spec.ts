import { describe, expect, it } from 'vitest'

import { defineTool } from './define-tool'
import { validateJsonSchema } from './schema'

describe('schema validation', () => {
  it('accepts nested object and array schemas', () => {
    expect(validateJsonSchema({
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      },
      required: ['ids'],
      additionalProperties: false
    })).toEqual([])
  })

  it('rejects unsupported schema types', () => {
    expect(validateJsonSchema({
      type: 'date'
    }, 'inputSchema')).toEqual([
      'inputSchema.type must be one of object, string, number, integer, boolean, array, null.'
    ])
  })

  it('rejects required fields that are not defined as properties', () => {
    expect(validateJsonSchema({
      type: 'object',
      properties: {
        amount: {
          type: 'number'
        }
      },
      required: ['customerId']
    }, 'inputSchema')).toEqual([
      'inputSchema.required includes "customerId", but inputSchema.properties does not define it.'
    ])
  })

  it('throws actionable defineTool errors for invalid input schemas', () => {
    expect(function defineInvalidTool() {
      defineTool({
        name: 'create_invoice',
        description: 'Create a draft invoice for a customer in the current workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: {
              type: 'money'
            }
          }
        },
        execute(input) {
          return input
        }
      })
    }).toThrow('Tool "create_invoice" has an invalid input schema: inputSchema.properties.amount.type must be one of object, string, number, integer, boolean, array, null.')
  })

  it('validates output schemas when provided', () => {
    expect(function defineInvalidOutputTool() {
      defineTool({
        name: 'search_products',
        description: 'Search the local product catalog and return matching products.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string'
            }
          },
          required: ['query']
        },
        outputSchema: {
          type: 'array',
          items: {
            type: 'record'
          }
        },
        execute(input) {
          return input
        }
      })
    }).toThrow('Tool "search_products" has an invalid output schema: outputSchema.items.type must be one of object, string, number, integer, boolean, array, null.')
  })
})
