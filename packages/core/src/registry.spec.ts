import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defineTool } from './define-tool'
import { clearToolsForTest, invokeTool, listTools, registerTool } from './registry'

describe('registry', () => {
  beforeEach(() => {
    clearToolsForTest()
  })

  it('registers and invokes a fallback tool', async () => {
    registerTool(defineTool({
      name: 'create_invoice',
      description: 'Create an invoice for a customer and open it in the current workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number' }
        },
        required: ['amount']
      },
      execute(input) {
        return { id: 'inv_1', amount: input.amount }
      }
    }))

    expect(listTools()).toHaveLength(1)

    const result = await invokeTool({
      toolName: 'create_invoice',
      input: { amount: 42 }
    })

    expect(result.status).toBe('success')
    expect(result.output).toEqual({ id: 'inv_1', amount: 42 })
  })

  it('blocks sensitive tools until confirmed', async () => {
    registerTool(defineTool({
      name: 'void_invoice',
      description: 'Void an existing invoice after the user has reviewed the pending action.',
      inputSchema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' }
        },
        required: ['invoiceId']
      },
      confirmation: {
        required: true,
        reason: 'Voiding an invoice cannot be undone in this demo.'
      },
      execute() {
        return { voided: true }
      }
    }))

    const blocked = await invokeTool({
      toolName: 'void_invoice',
      input: { invoiceId: 'inv_1' }
    })

    expect(blocked.status).toBe('blocked')

    const confirmed = await invokeTool({
      toolName: 'void_invoice',
      input: { invoiceId: 'inv_1' },
      confirmed: true
    })

    expect(confirmed.status).toBe('success')
  })

  it('returns an error before handlers run when input validation fails', async () => {
    const guard = vi.fn(function allowInvocation() {
      return true
    })
    const execute = vi.fn(function createInvoice() {
      return { id: 'inv_1' }
    })

    registerTool(defineTool({
      name: 'create_invoice',
      description: 'Create an invoice for a customer and open it in the current workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          amount: { type: 'number', minimum: 0.01 }
        },
        required: ['customerName', 'amount'],
        additionalProperties: false
      },
      confirmation: {
        required: true,
        reason: 'Creates a billable invoice.'
      },
      guard,
      execute
    }))

    const result = await invokeTool({
      toolName: 'create_invoice',
      input: { customerName: 123, amount: 'not-a-number' },
      confirmed: true
    })

    expect(result.status).toBe('error')
    expect(result.error).toBe('input validation failed: /customerName expected string, got integer. /amount expected number, got string.')
    expect(guard).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})
