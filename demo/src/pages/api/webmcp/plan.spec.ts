import { afterEach, describe, expect, it, vi } from 'vitest'

import { env } from '@/test-utils/cloudflare-workers-stub'

import { POST } from './plan'

describe('/api/webmcp/plan', () => {
  afterEach(() => {
    delete env.AI
    delete env.CLOUDFLARE_ACCOUNT_ID
    delete env.CLOUDFLARE_API_TOKEN
    delete env.OPENAI_API_KEY
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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
    vi.spyOn(console, 'error').mockImplementation(function ignoreErrorLog() {})

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

  it('plans through OpenAI using GPT-5.4 mini', async () => {
    const fetch = vi.fn(async () => Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              toolName: 'select_items',
              input: { ids: ['item_8'] },
              confidence: 0.91,
              reason: 'Selected water.'
            })
          }
        }
      ]
    }))
    vi.stubGlobal('fetch', fetch)
    env.OPENAI_API_KEY = 'test-openai-key'

    const response = await POST(createContext({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      message: 'Select water',
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
      context: {
        checklistItems: [
          { id: 'item_8', name: 'Water' }
        ]
      }
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      toolName: 'select_items',
      input: { ids: ['item_8'] },
      confidence: 0.91,
      reason: 'Selected water.'
    })
    expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-openai-key'
      }),
      method: 'POST'
    }))
    const fetchOptions = (fetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1]
    const request = JSON.parse(String(fetchOptions?.body)) as { model?: string }
    expect(request.model).toBe('gpt-5.4-mini')
  })

  it('returns a clear error when OpenAI server env is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(function ignoreErrorLog() {})
    env.OPENAI_API_KEY = ''

    const response = await POST(createContext({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      message: 'Select water',
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
      error: 'OpenAI server mode needs OPENAI_API_KEY on the server.'
    })
  })

  it('logs upstream OpenAI errors before returning 502', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(function ignoreErrorLog() {})
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: {
        message: 'upstream failed for sk-test-secret'
      }
    }, {
      status: 502
    })))
    env.OPENAI_API_KEY = 'test-openai-key'

    const response = await POST(createContext({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      message: 'Select water',
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
      error: 'OpenAI returned 502'
    })
    expect(consoleError).toHaveBeenCalledWith('Server planner returned 502', expect.objectContaining({
      event: 'webmcp.serverPlanner.502',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      status: 502,
      toolCount: 1,
      toolNames: ['select_items'],
      publicError: 'OpenAI returned 502',
      error: expect.objectContaining({
        message: 'OpenAI returned 502',
        upstreamResponse: expect.stringContaining('sk-[redacted]')
      })
    }))
  })

  it('returns a clear error when the Cloudflare AI binding is local-only', async () => {
    vi.spyOn(console, 'error').mockImplementation(function ignoreErrorLog() {})
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

  it('retries Cloudflare AI binding without response_format when the model rejects it', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('response_format is not supported by this model'))
      .mockResolvedValueOnce({
        response: JSON.stringify({
          toolName: 'select_items',
          input: { ids: ['item_1'] },
          confidence: 0.82,
          reason: 'Selected fruit.'
        })
      })
    env.AI = {
      run
    } as unknown as typeof env.AI

    const response = await POST(createContext({
      provider: 'cloudflare-binding',
      model: '@cf/nvidia/nemotron-3-120b-a12b',
      message: 'Select all fruits',
      tools: [
        {
          name: 'select_items',
          description: 'Select checklist items.',
          inputSchema: { type: 'object' }
        }
      ],
      context: {
        checklistItems: [
          { id: 'item_1', name: 'Apple' }
        ]
      }
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      toolName: 'select_items',
      input: { ids: ['item_1'] }
    })
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenNthCalledWith(1, '@cf/nvidia/nemotron-3-120b-a12b', expect.objectContaining({
      response_format: { type: 'json_object' }
    }))
    expect(run).toHaveBeenNthCalledWith(2, '@cf/nvidia/nemotron-3-120b-a12b', expect.not.objectContaining({
      response_format: expect.anything()
    }))
    expect(run.mock.calls[1]?.[1]).not.toHaveProperty('response_format')
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
    vi.spyOn(console, 'error').mockImplementation(function ignoreErrorLog() {})
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
      error: 'Invalid tool input: input validation failed: /ids is required.'
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
