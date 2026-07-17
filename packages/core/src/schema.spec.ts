import { describe, expect, it } from 'vitest'

import { defineTool } from './define-tool'
import { validateJsonSchema, validateJsonValue } from './schema'

describe('schema validation', () => {
  it('accepts nested object and array schemas', () => {
    expect(
      validateJsonSchema({
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
      })
    ).toEqual([])
  })

  it('accepts anyOf schemas', () => {
    expect(
      validateJsonSchema({
        anyOf: [{ type: 'string' }, { type: 'null' }]
      })
    ).toEqual([])
  })

  it('accepts oneOf and const schemas used by native WebMCP tools', () => {
    expect(
      validateJsonSchema({
        oneOf: [
          { type: 'string', const: 'today', title: 'Today' },
          { type: 'string', const: 'last_7_days', title: 'Last 7 days' }
        ]
      })
    ).toEqual([])
  })

  it('rejects unsupported schema types', () => {
    expect(
      validateJsonSchema(
        {
          type: 'date'
        },
        'inputSchema'
      )
    ).toEqual([
      'inputSchema.type must be one of object, string, number, integer, boolean, array, null.'
    ])
  })

  it('rejects required fields that are not defined as properties', () => {
    expect(
      validateJsonSchema(
        {
          type: 'object',
          properties: {
            amount: {
              type: 'number'
            }
          },
          required: ['customerId']
        },
        'inputSchema'
      )
    ).toEqual([
      'inputSchema.required includes "customerId", but inputSchema.properties does not define it.'
    ])
  })

  it('rejects invalid string constraint keywords', () => {
    expect(
      validateJsonSchema(
        {
          type: 'string',
          minLength: -1,
          maxLength: 2.5,
          pattern: '['
        },
        'inputSchema'
      )
    ).toEqual([
      'inputSchema.minLength must be a non-negative integer.',
      'inputSchema.maxLength must be a non-negative integer.',
      'inputSchema.pattern must be a valid regular expression.'
    ])
  })

  it('rejects non-finite number constraints and values', () => {
    expect(
      validateJsonSchema(
        {
          type: 'number',
          minimum: Infinity
        },
        'inputSchema'
      )
    ).toEqual(['inputSchema.minimum must be a finite number.'])

    expect(
      validateJsonValue(
        {
          amount: Infinity
        },
        {
          type: 'object',
          properties: {
            amount: { type: 'number' }
          },
          required: ['amount']
        }
      )
    ).toEqual(['/amount expected number, got Infinity.'])
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
    }).toThrow(
      'Tool "create_invoice" has an invalid input schema: inputSchema.properties.amount.type must be one of object, string, number, integer, boolean, array, null.'
    )
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
    }).toThrow(
      'Tool "search_products" has an invalid output schema: outputSchema.items.type must be one of object, string, number, integer, boolean, array, null.'
    )
  })

  it('validates values against object schemas', () => {
    expect(
      validateJsonValue(
        {
          amount: '42',
          status: 'draft',
          extra: true
        },
        {
          type: 'object',
          properties: {
            customerName: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 },
            status: { type: 'string', enum: ['sent', 'paid'] }
          },
          required: ['customerName', 'amount'],
          additionalProperties: false
        }
      )
    ).toEqual([
      '/customerName is required.',
      '/amount expected number, got string.',
      '/status expected one of "sent", "paid", got "draft".',
      '/extra is not allowed.'
    ])
  })

  it('validates nested array item schemas', () => {
    expect(
      validateJsonValue(
        {
          lineItems: [{ quantity: 2 }, { quantity: 1.5 }]
        },
        {
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
        }
      )
    ).toEqual(['/lineItems/1/quantity expected integer, got number.'])
  })

  it('validates array length constraints', () => {
    expect(
      validateJsonValue([], {
        type: 'array',
        items: {
          type: 'string'
        },
        minItems: 1
      })
    ).toEqual(['/ expected array length >= 1, got 0.'])
  })

  it('validates values against anyOf schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        note: {
          anyOf: [{ type: 'string' }, { type: 'null' }]
        }
      },
      required: ['note']
    }

    expect(validateJsonValue({ note: null }, schema)).toEqual([])
    expect(validateJsonValue({ note: 'paid' }, schema)).toEqual([])
    expect(validateJsonValue({ note: 42 }, schema)).toEqual([
      '/note did not match any allowed schema.'
    ])
  })

  it('validates values against oneOf, const, and known string formats', () => {
    const schema = {
      type: 'object',
      properties: {
        timeframe: {
          oneOf: [
            { type: 'string', const: 'today' },
            { type: 'string', const: 'last_7_days' }
          ]
        },
        email: { type: 'string', format: 'email' }
      },
      required: ['timeframe', 'email']
    }

    expect(validateJsonValue({ timeframe: 'today', email: 'person@example.com' }, schema)).toEqual(
      []
    )
    expect(validateJsonValue({ timeframe: 'tomorrow', email: 'invalid' }, schema)).toEqual([
      '/timeframe did not match exactly one allowed schema.',
      '/email expected email format, got "invalid".'
    ])
  })

  it('validates calendar dates, clock times, date-times, and minimally valid emails', () => {
    expect(validateJsonValue('person@example', { type: 'string', format: 'email' })).toEqual([])
    expect(validateJsonValue('2024-02-29', { type: 'string', format: 'date' })).toEqual([])
    expect(validateJsonValue('2026-13-40', { type: 'string', format: 'date' })).toEqual([
      '/ expected date format, got "2026-13-40".'
    ])
    expect(validateJsonValue('2025-02-29', { type: 'string', format: 'date' })).toEqual([
      '/ expected date format, got "2025-02-29".'
    ])
    expect(validateJsonValue('25:90', { type: 'string', format: 'time' })).toEqual([
      '/ expected time format, got "25:90".'
    ])
    expect(
      validateJsonValue('2026-07-17T14:30:00Z', { type: 'string', format: 'date-time' })
    ).toEqual([])
    expect(
      validateJsonValue('2026-02-30T25:90:00Z', { type: 'string', format: 'date-time' })
    ).toEqual(['/ expected date-time format, got "2026-02-30T25:90:00Z".'])
  })
})
