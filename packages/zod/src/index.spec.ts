import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'

import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import { invokeTool, registerTool, setConfirmationHandler } from '@vampaz/webmcp-kit'

import { defineZodTool, type DefineZodToolOptions } from './index'

describe('defineZodTool', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
  })

  it('converts a Zod schema into a typed WebMCP tool', async () => {
    const execute = vi.fn(function createInvoice(input: { customerName: string; amount: number }) {
      return { id: 'inv_1', amount: input.amount }
    })

    const tool = defineZodTool({
      name: 'create_invoice',
      description: 'Create a draft invoice for a customer in the current workspace.',
      schema: z.object({
        customerName: z.string().describe('Customer to invoice.'),
        amount: z.number().min(0.01).describe('Invoice amount in euros.')
      }),
      execute(input) {
        expectTypeOf(input.customerName).toEqualTypeOf<string>()
        expectTypeOf(input.amount).toEqualTypeOf<number>()

        return execute(input)
      }
    })

    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        customerName: {
          type: 'string',
          description: 'Customer to invoice.'
        },
        amount: {
          type: 'number',
          minimum: 0.01,
          description: 'Invoice amount in euros.'
        }
      },
      required: ['customerName', 'amount']
    })

    registerTool(tool)

    const result = await invokeTool({
      toolName: 'create_invoice',
      input: { customerName: 'Ada', amount: 42 }
    })

    expect(result.status).toBe('success')
    expect(result.output).toEqual({ id: 'inv_1', amount: 42 })
    expect(execute).toHaveBeenCalledWith({ customerName: 'Ada', amount: 42 })
  })

  it('uses the generated JSON Schema for runtime input validation', async () => {
    const execute = vi.fn(function createInvoice() {
      return { id: 'inv_1' }
    })

    registerTool(
      defineZodTool({
        name: 'create_invoice',
        description: 'Create a draft invoice for a customer in the current workspace.',
        schema: z.object({
          customerName: z.string(),
          amount: z.number().min(0.01)
        }),
        execute
      })
    )

    const result = await invokeTool({
      toolName: 'create_invoice',
      input: { customerName: 123, amount: 'not-a-number' }
    })

    expect(result.status).toBe('error')
    expect(result.error).toBe(
      'input validation failed: /customerName expected string, got integer. /amount expected number, got string.'
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('checks refinements before confirmation and guards', async () => {
    const approval = vi.fn(() => true)
    const guard = vi.fn(() => true)
    const execute = vi.fn()
    setConfirmationHandler(approval)
    registerTool(
      defineZodTool({
        name: 'save_note',
        description: 'Save a valid note in the active workspace.',
        schema: z.object({ note: z.string().refine((value) => value !== 'blocked') }),
        confirmation: { reason: 'Save?' },
        guard,
        execute
      })
    )
    expect(await invokeTool({ toolName: 'save_note', input: { note: 'blocked' } })).toMatchObject({
      code: 'invalid_input'
    })
    expect(approval).not.toHaveBeenCalled()
    expect(guard).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('applies defaults and transforms before approving the value that executes', async () => {
    const approval = vi.fn(() => true)
    const execute = vi.fn()
    setConfirmationHandler(approval)
    registerTool(
      defineZodTool({
        name: 'save_note',
        description: 'Save the normalized note.',
        schema: z.object({
          note: z
            .string()
            .default(' draft ')
            .transform((value) => value.trim())
        }),
        confirmation: { reason: 'Save?' },
        execute
      })
    )
    expect(await invokeTool({ toolName: 'save_note', input: {} })).toMatchObject({
      status: 'success'
    })
    expect(approval).toHaveBeenCalledWith(expect.objectContaining({ input: { note: 'draft' } }))
    expect(execute).toHaveBeenCalledWith({ note: 'draft' }, { source: 'fallback' })
  })

  it('types examples as raw schema input and callbacks as parsed output', async () => {
    const execute = vi.fn()
    const schema = z.object({ count: z.string().transform(Number) })
    const tool = defineZodTool({
      name: 'add_items',
      description: 'Add a number of items to the cart.',
      schema,
      examples: [{ count: '3' }],
      guard(input) {
        expectTypeOf(input.count).toEqualTypeOf<number>()
        return true
      },
      execute(input) {
        expectTypeOf(input.count).toEqualTypeOf<number>()
        execute(input)
      }
    })
    expectTypeOf<DefineZodToolOptions<typeof schema>['examples']>().toEqualTypeOf<
      Array<{ count: string }> | undefined
    >()

    expect(tool.examples).toEqual([{ count: '3' }])
    registerTool(tool)
    expect(await invokeTool({ toolName: 'add_items', input: { count: '3' } })).toMatchObject({
      status: 'success'
    })
    expect(execute).toHaveBeenCalledWith({ count: 3 })
  })

  it('forwards tool annotations to the core tool definition', () => {
    const tool = defineZodTool({
      name: 'search_products',
      description: 'Search the visible product catalog.',
      schema: z.object({
        query: z.string()
      }),
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true
      },
      execute(input) {
        return input
      }
    })

    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true
    })
  })

  it('validates nullable fields emitted as anyOf schemas', async () => {
    const execute = vi.fn(function saveNote(input: { note: string | null }) {
      return input
    })

    const tool = defineZodTool({
      name: 'save_note',
      description: 'Save an optional note for the currently selected invoice.',
      schema: z.object({
        note: z.string().nullable()
      }),
      execute
    })

    expect(tool.inputSchema.properties?.note).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }]
    })

    registerTool(tool)

    const result = await invokeTool({
      toolName: 'save_note',
      input: { note: null }
    })

    expect(result.status).toBe('success')
    expect(execute).toHaveBeenCalledWith({ note: null }, { source: 'fallback' })
  })
})
