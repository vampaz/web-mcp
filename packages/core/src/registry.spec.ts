import { beforeEach, describe, expect, it } from 'vitest'

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
})
