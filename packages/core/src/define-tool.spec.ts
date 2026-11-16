import { describe, expect, expectTypeOf, it } from 'vitest'

import { defineTool } from './define-tool'
import { invokeTool, registerTool } from './registry'
import type { WebMCPTool } from './interfaces/tool'

describe('defineTool', () => {
  it.each(['needs_clarification', 'no_tools_match', 'tool_sequence'])(
    'rejects the reserved resolver name "%s"',
    (reservedName) => {
      expect(function defineReservedTool() {
        defineTool({
          name: reservedName,
          description: 'A tool that collides with a reserved resolver name.',
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

  it('accepts readonly schemas and rejects incompatible executor types', () => {
    const schema = {
      type: 'object',
      properties: { count: { type: 'number' } },
      required: ['count']
    } as const
    defineTool({
      name: 'read_count',
      description: 'Read the requested count.',
      inputSchema: schema,
      execute(input) {
        expectTypeOf(input.count).toEqualTypeOf<number>()
        return input.count
      }
    })
    defineTool({
      name: 'bad_count',
      description: 'An incompatible executor.',
      inputSchema: schema,
      // @ts-expect-error The schema determines count, not the executor annotation.
      execute(input: { count: string }) {
        return input.count
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
  it('defaults an omitted inputSchema and types input as a record', () => {
    const tool = defineTool({
      name: 'read_value',
      description: 'Read the current visible application value without a model.',
      annotations: { readOnlyHint: true },
      guard(input) {
        expectTypeOf(input).toEqualTypeOf<Record<string, unknown>>()
        return true
      },
      execute(input) {
        expectTypeOf(input).toEqualTypeOf<Record<string, unknown>>()
        return input
      }
    })

    expect(tool.inputSchema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false
    })
    expectTypeOf(tool).toMatchTypeOf<WebMCPTool<Record<string, unknown>>>()
  })

  it('keeps hand-built registerTool definitions requiring a schema', () => {
    if (false) {
      // @ts-expect-error registerTool() still requires inputSchema when no defineTool() default applies.
      registerTool({
        name: 'hand_built',
        description: 'A hand-built tool must still declare its input schema.',
        execute() {
          return {}
        }
      })
    }
  })

  it('enforces the default schema through the public invocation pipeline', async () => {
    const registration = registerTool(
      defineTool({
        name: 'refresh_defaults',
        description: 'Refresh the visible application data without additional input.',
        execute() {
          return { ok: true }
        }
      })
    )
    try {
      await expect(
        invokeTool({ toolName: 'refresh_defaults', input: {}, source: 'fallback' })
      ).resolves.toMatchObject({ status: 'success', output: { ok: true } })
      await expect(
        invokeTool({
          toolName: 'refresh_defaults',
          input: { unexpected: true },
          source: 'fallback'
        })
      ).resolves.toMatchObject({ status: 'error', code: 'invalid_input' })
    } finally {
      registration.unregister()
    }
  })

  it('rejects a hand-built registration without a schema at runtime', () => {
    expect(function registerWithoutSchema() {
      registerTool({
        name: 'hand_built_runtime',
        description: 'A hand-built tool without an input schema.',
        execute() {
          return {}
        }
      } as unknown as WebMCPTool)
    }).toThrow('must include an input schema')
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
