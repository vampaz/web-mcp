import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'

import { clearToolsForTest, invokeTool, registerTool } from '@webmcp-kit/core'

import { defineZodTool } from './index'

describe('defineZodTool', () => {
  beforeEach(() => {
    clearToolsForTest()
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
      required: ['customerName', 'amount'],
      additionalProperties: false
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
