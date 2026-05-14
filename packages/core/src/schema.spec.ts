import { describe, expect, it } from 'vitest'

import { defineTool } from './define-tool'
import { validateJsonSchema, validateJsonValue } from './schema'

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

  it('rejects invalid string constraint keywords', () => {
    expect(validateJsonSchema({
      type: 'string',
      minLength: -1,
      maxLength: 2.5,
      pattern: '['
    }, 'inputSchema')).toEqual([
      'inputSchema.minLength must be a non-negative integer.',
      'inputSchema.maxLength must be a non-negative integer.',
      'inputSchema.pattern must be a valid regular expression.'
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

  it('validates values against object schemas', () => {
    expect(validateJsonValue({
      amount: '42',
      status: 'draft',
      extra: true
    }, {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        amount: { type: 'number', minimum: 0.01 },
        status: { type: 'string', enum: ['sent', 'paid'] }
      },
      required: ['customerName', 'amount'],
      additionalProperties: false
    })).toEqual([
      '/customerName is required.',
      '/amount expected number, got string.',
      '/status expected one of "sent", "paid", got "draft".',
      '/extra is not allowed.'
    ])
  })

  it('validates nested array item schemas', () => {
    expect(validateJsonValue({
      lineItems: [
        { quantity: 2 },
        { quantity: 1.5 }
      ]
    }, {
      type: 'object',
      properties: {
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              quantity: { type: 'integer', minimum: 1 }
            },
            required: ['quantity']
          }
        }
      }
    })).toEqual([
      '/lineItems/1/quantity expected integer, got number.'
    ])
  })
})
