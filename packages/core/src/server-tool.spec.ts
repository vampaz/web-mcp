import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest, invokeTool, registerTool } from './registry'
import { defineServerTool } from './server-tool'

describe('server tools', () => {
  afterEach(() => {
    clearToolsForTest()
  })

  it('posts tool input to the configured endpoint', async () => {
    const fetchTool = vi.fn(async function fetchTool() {
      return Response.json({ invoiceId: 'inv_1' })
    })

    registerTool(
      defineServerTool({
        name: 'send_invoice',
        description: 'Send an invoice email from the server.',
        endpoint: '/api/tools/send-invoice',
        fetch: fetchTool,
        inputSchema: {
          type: 'object',
          properties: {
            invoiceId: { type: 'string' }
          },
          required: ['invoiceId'],
          additionalProperties: false
        },
        confirmation: {
          required: true,
          reason: 'Sending an invoice emails a customer.'
        }
      })
    )

    const result = await invokeTool({
      toolName: 'send_invoice',
      input: { invoiceId: 'inv_1' },
      confirmed: true,
      source: 'planner'
    })

    expect(result).toMatchObject({
      status: 'success',
      output: { invoiceId: 'inv_1' }
    })
    expect(fetchTool).toHaveBeenCalledWith('/api/tools/send-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        toolName: 'send_invoice',
        input: { invoiceId: 'inv_1' },
        source: 'planner'
      })
    })
  })

  it('surfaces server endpoint errors through tool invocation results', async () => {
    const fetchTool = vi.fn(async function fetchTool() {
      return Response.json({ error: 'Invoice is already paid.' }, { status: 409 })
    })

    registerTool(
      defineServerTool({
        name: 'send_invoice',
        description: 'Send an invoice email from the server.',
        endpoint: '/api/tools/send-invoice',
        fetch: fetchTool,
        inputSchema: {
          type: 'object',
          properties: {
            invoiceId: { type: 'string' }
          },
          required: ['invoiceId'],
          additionalProperties: false
        }
      })
    )

    const result = await invokeTool({
      toolName: 'send_invoice',
      input: { invoiceId: 'inv_1' },
      source: 'planner'
    })

    expect(result).toMatchObject({
      status: 'error',
      error: 'send_invoice server endpoint returned 409: Invoice is already paid.'
    })
  })
})
