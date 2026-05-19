import { afterEach, describe, expect, it, vi } from 'vitest'

import { env } from '@/test-utils/cloudflare-workers-stub'

import { POST } from './plan'

describe('/api/webmcp/plan', () => {
  afterEach(() => {
    delete env.AI
    delete env.CLOUDFLARE_ACCOUNT_ID
    delete env.CLOUDFLARE_API_TOKEN
  })

  it('plans through a Cloudflare AI binding when the runtime provides one', async () => {
    const run = vi.fn(async () => ({
      response: JSON.stringify({
        toolName: 'select_items',
        input: { ids: ['item_8'] },
        confidence: 0.89,
        reason: 'Selected liquids.'
      })
    }))
    env.AI = {
      run
    } as unknown as typeof env.AI

    const response = await POST(createContext({
      provider: 'cloudflare-binding',
      model: '@cf/google/gemma-4-26b-a4b-it',
      message: 'Select all items with water',
      tools: [
        {
          name: 'select_items',
          description: 'Select checklist items.',
          inputSchema: { type: 'object' }
        }
      ],
      context: {
        checklistItems: [
          { id: 'item_8', name: 'Water', description: 'drink, beverage' }
        ]
      }
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      toolName: 'select_items',
      input: { ids: ['item_8'] },
      confidence: 0.89,
      reason: 'Selected liquids.'
    })
    expect(run).toHaveBeenCalledWith('@cf/google/gemma-4-26b-a4b-it', expect.objectContaining({
      temperature: 0
    }))
  })

  it('returns a clear error when Cloudflare Workers AI server env is missing', async () => {
    const response = await POST(createContext({
      provider: 'cloudflare-workers-ai',
      model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      message: 'Select all items with water',
      tools: [
        {
          name: 'select_items',
          description: 'Select checklist items.',
          inputSchema: { type: 'object' }
        }
      ],
      context: {}
    }))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Cloudflare Workers AI server mode needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server, or a custom planner endpoint.'
    })
  })

  it('returns a clear error when the Cloudflare AI binding is local-only', async () => {
    env.AI = {
      run: async () => {
        throw new Error('Binding AI needs to be run remotely')
      }
    } as unknown as typeof env.AI

    const response = await POST(createContext({
      provider: 'cloudflare-binding',
      model: '@cf/google/gemma-4-26b-a4b-it',
      message: 'Select all items with water',
      tools: [
        {
          name: 'select_items',
          description: 'Select checklist items.',
          inputSchema: { type: 'object' }
        }
      ],
      context: {}
    }))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Cloudflare AI binding is not connected to remote Workers AI in this dev session.'
    })
  })

  it('rejects oversized planner requests before calling Cloudflare', async () => {
    const run = vi.fn()
    env.AI = {
      run
    } as unknown as typeof env.AI

    const response = await POST(createContext({
      provider: 'cloudflare-binding',
      model: '@cf/google/gemma-4-26b-a4b-it',
      message: 'x'.repeat(140 * 1024),
      tools: [],
      context: {}
    }))

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: 'Planner request is too large.'
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects plans whose input does not match the selected tool schema', async () => {
    env.AI = {
      run: vi.fn(async () => ({
        response: JSON.stringify({
          toolName: 'select_items',
          input: {},
          confidence: 0.89,
          reason: 'Selected liquids.'
        })
      }))
    } as unknown as typeof env.AI

    const response = await POST(createContext({
      provider: 'cloudflare-binding',
      model: '@cf/google/gemma-4-26b-a4b-it',
      message: 'Select all items with water',
      tools: [
        {
          name: 'select_items',
          description: 'Select checklist items.',
          inputSchema: {
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
          }
        }
      ],
      context: {}
    }))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Server planner failed'
    })
  })

  it('accepts validated tool sequence plans', async () => {
    const sequencePlan = {
      toolName: 'tool_sequence',
      input: {},
      confidence: 0.9,
      reason: 'Select the matching invoice, then update its status.',
      steps: [
        {
          toolName: 'select_invoices',
          input: { ids: ['inv_104'] },
          confidence: 0.9,
          reason: 'Selected Stark invoices.'
        },
        {
          toolName: 'update_selected_invoice_status',
          input: { status: 'paid' },
          confidence: 0.9,
          reason: 'Marked selected invoices paid.'
        }
      ]
    }
    env.AI = {
      run: vi.fn(async () => ({
        response: JSON.stringify(sequencePlan)
      }))
    } as unknown as typeof env.AI

    const response = await POST(createContext({
      provider: 'cloudflare-binding',
      model: '@cf/google/gemma-4-26b-a4b-it',
      message: 'Mark Stark Industries invoices as paid',
      tools: [
        {
          name: 'select_invoices',
          description: 'Select invoice rows.',
          inputSchema: {
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
          }
        },
        {
          name: 'update_selected_invoice_status',
          description: 'Update selected invoice statuses.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['draft', 'sent', 'overdue', 'paid', 'void']
              }
            },
            required: ['status'],
            additionalProperties: false
          }
        }
      ],
      context: {}
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(sequencePlan)
  })
})

function createContext(body: unknown) {
  return {
    request: new Request('http://localhost/api/webmcp/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }),
    locals: {}
  } as unknown as Parameters<typeof POST>[0]
}
