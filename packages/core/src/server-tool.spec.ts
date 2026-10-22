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
          reason: 'Sending an invoice emails a customer.',
          handler() {
            return true
          }
        }
      })
    )

    const result = await invokeTool({
      toolName: 'send_invoice',
      input: { invoiceId: 'inv_1' },
      source: 'resolver'
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
        source: 'resolver'
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
      source: 'resolver'
    })

    expect(result).toMatchObject({
      status: 'error',
      error: 'send_invoice server endpoint returned 409: Invoice is already paid.'
    })
  })

  it('passes invocation cancellation to the server request', async () => {
    const fetchTool = vi.fn(async function fetchTool() {
      return Response.json({ invoiceId: 'inv_1' })
    })
    const controller = new AbortController()

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

    await invokeTool({
      toolName: 'send_invoice',
      input: { invoiceId: 'inv_1' },
      signal: controller.signal
    })

    expect(fetchTool).toHaveBeenCalledWith(
      '/api/tools/send-invoice',
      expect.objectContaining({
        signal: controller.signal
      })
    )
  })

  it('runs parseInput before approval and infers input types from the schema', async () => {
    const fetchTool = vi.fn(async function fetchTool() {
      return Response.json({ ok: true })
    })
    const tool = defineServerTool({
      name: 'rename_note',
      description: 'Rename the selected note on the server after trimming the title.',
      endpoint: '/api/tools/rename-note',
      fetch: fetchTool,
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false
      },
      parseInput(input) {
        const { title } = input as { title: string }
        if (!title.trim()) throw new Error('Title must not be blank.')
        return { title: title.trim() }
      },
      guard(input) {
        const title: string = input.title
        return title.length <= 80
      }
    })
    registerTool(tool)

    await expect(
      invokeTool({ toolName: 'rename_note', input: { title: '   ' } })
    ).resolves.toMatchObject({ status: 'error', code: 'invalid_input' })
    expect(fetchTool).not.toHaveBeenCalled()

    await invokeTool({ toolName: 'rename_note', input: { title: '  Plan  ' } })
    const [, init] = fetchTool.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      input: { title: 'Plan' }
    })
  })
})
