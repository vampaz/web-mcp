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
      message: 'Select all liquids from the list',
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
      message: 'Select all liquids from the list',
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
      message: 'Select all liquids from the list',
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
      error: 'Cloudflare AI binding is running in local stub mode. Restart dev with `npm run dev:cf` so the Astro Cloudflare adapter enables remote bindings, or use a Cloudflare preview deployment.'
    })
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
