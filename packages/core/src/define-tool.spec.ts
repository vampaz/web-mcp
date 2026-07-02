import { describe, expect, expectTypeOf, it } from 'vitest'

import { defineTool } from './define-tool'

describe('defineTool', () => {
  it.each(['needs_clarification', 'no_tools_match', 'tool_sequence'])(
    'rejects the reserved planner name "%s"',
    (reservedName) => {
      expect(function defineReservedTool() {
        defineTool({
          name: reservedName,
          description: 'A tool that collides with a reserved planner name.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false
          },
          execute() {
            return {}
          }
        })
      }).toThrowError(`Tool name "${reservedName}" is reserved`)
    }
  )

  it('accepts non-reserved tool names', () => {
    const tool = defineTool({
      name: 'select_items',
      description: 'Select checklist items.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      },
      execute() {
        return {}
      }
    })

    expect(tool.name).toBe('select_items')
  })

  it('infers execute and guard input types from the input schema literal', () => {
    defineTool({
      name: 'update_invoice',
      description: 'Update an invoice from typed schema input.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          amount: { type: 'number' },
          status: { type: 'string', enum: ['draft', 'paid'] },
          tags: { type: 'array', items: { type: 'string' } },
          urgent: { type: 'boolean' }
        },
        required: ['id', 'amount'],
        additionalProperties: false
      },
      guard(input) {
        expectTypeOf(input.id).toEqualTypeOf<string>()
        return true
      },
      execute(input) {
        expectTypeOf(input.id).toEqualTypeOf<string>()
        expectTypeOf(input.amount).toEqualTypeOf<number>()
        expectTypeOf(input.status).toEqualTypeOf<'draft' | 'paid' | undefined>()
        expectTypeOf(input.tags).toEqualTypeOf<string[] | undefined>()
        expectTypeOf(input.urgent).toEqualTypeOf<boolean | undefined>()
        return input.id
      }
    })
  })

  it('keeps explicit input generics working', () => {
    interface UpdateInvoiceInput {
      id: string
    }

    const tool = defineTool<UpdateInvoiceInput>({
      name: 'update_invoice',
      description: 'Update an invoice from an explicit input generic.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      },
      execute(input) {
        expectTypeOf(input).toEqualTypeOf<UpdateInvoiceInput>()
        return input.id
      }
    })

    expect(tool.name).toBe('update_invoice')
  })

  it('falls back to a record input type for wide schemas', () => {
    const wideSchema = createWideSchema()

    defineTool({
      name: 'wide_schema_tool',
      description: 'Tool defined from a schema that is not a literal.',
      inputSchema: wideSchema,
      execute(input) {
        expectTypeOf(input).toEqualTypeOf<Record<string, unknown>>()
        return input
      }
    })
  })
})

function createWideSchema() {
  const type: string = 'object'

  return {
    type,
    properties: {},
    required: [] as string[],
    additionalProperties: false
  }
}
