import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBestPlanner, createChromeAIPlanner, createConfiguredPlanner, createHeuristicPlanner } from './planner'

interface WindowWithLanguageModel extends Window {
  LanguageModel?: {
    availability: (options?: unknown) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
    create: (options?: unknown) => Promise<{
      prompt: (message: string) => Promise<string>
    }>
  }
}

describe('planner', () => {
  afterEach(() => {
    delete (window as WindowWithLanguageModel).LanguageModel
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('uses a deterministic fallback planner without Chrome built-in AI', async () => {
    const planner = await createBestPlanner()
    const plan = await planner.plan('Create an invoice for Acme for 250 euros', [])

    expect(planner.status).toBe('fallback')
    expect(plan.toolName).toBe('create_invoice')
    expect(plan.input.amount).toBe(250)
  })

  it('uses Chrome AI as the active planner when the model is downloadable', async () => {
    const create = vi.fn(async () => ({
      prompt: async () => JSON.stringify({
        toolName: 'select_items',
        input: { ids: ['item_4', 'item_7'] },
        confidence: 0.9,
        reason: 'Chrome chose French foods.'
      })
    }))
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'downloadable',
      create
    }

    const planner = await createBestPlanner()
    const plan = await planner.plan('Select all the foods that are French', [])

    expect(planner.available).toBe(true)
    expect(planner.status).toBe('downloadable')
    expect(plan.toolName).toBe('select_items')
    expect(plan.input).toEqual({
      ids: ['item_4', 'item_7']
    })
    expect(create).toHaveBeenCalledOnce()
  })

  it('uses Chrome built-in AI when available', async () => {
    const create = vi.fn(async () => ({
      prompt: async () => JSON.stringify({
        toolName: 'search_products',
        input: { query: 'dock' },
        confidence: 0.9,
        reason: 'Chrome chose product search.'
      })
    }))
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create
    }

    const planner = await createChromeAIPlanner()
    expect(create).not.toHaveBeenCalled()

    const plan = await planner.plan('Find docks', [])

    expect(planner.available).toBe(true)
    expect(planner.status).toBe('ready')
    expect(plan.toolName).toBe('search_products')
    expect(create).toHaveBeenCalledOnce()
  })

  it('falls back if Chrome AI session creation fails after user activation', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('user activation required')
      }
    }

    const planner = await createChromeAIPlanner()
    const plan = await planner.plan('Add ten keyboards to the cart.', [])

    expect(planner.available).toBe(true)
    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input.quantity).toBe(10)
    expect(plan.reason).toContain('Used deterministic fallback')
  })

  it('creates a direct heuristic planner', () => {
    const planner = createHeuristicPlanner()

    expect(planner.status).toBe('fallback')
    expect(planner.available).toBe(true)
  })

  it('extracts word quantities for cart commands', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Add ten keyboards to the card.', [])

    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input).toEqual({
      productId: 'kbd-01',
      quantity: 10
    })
  })

  it('extracts numeric quantities for cart commands', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Add 12 docks to the cart.', [])

    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input).toEqual({
      productId: 'dock-02',
      quantity: 12
    })
  })

  it('plans positional checklist selection', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Select the first five items', [], {
      checklistItems: [
        { id: 'item_1' },
        { id: 'item_2' },
        { id: 'item_3' },
        { id: 'item_4' },
        { id: 'item_5' },
        { id: 'item_6' }
      ]
    })

    expect(plan.toolName).toBe('select_items')
    expect(plan.input).toEqual({
      ids: ['item_1', 'item_2', 'item_3', 'item_4', 'item_5']
    })
  })

  it('does not route semantic checklist selection to product search in fallback mode', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Select all the items that are French food.', [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      },
      {
        name: 'search_products',
        description: 'Search products.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(plan.toolName).toBe('select_items')
    expect(plan.input).toEqual({
      ids: []
    })
    expect(plan.reason).toContain('cannot infer semantic checklist selection')
  })

  it('passes app context to Chrome AI for semantic selection', async () => {
    let promptText = ''
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (message: string) => {
          promptText = message
          return JSON.stringify({
            toolName: 'select_items',
            input: { ids: ['item_4', 'item_7'] },
            confidence: 0.93,
            reason: 'Selected French foods from checklist context.'
          })
        }
      })
    }

    const planner = await createChromeAIPlanner()
    const plan = await planner.plan('Select all the foods that are French', [], {
      checklistItems: [
        { id: 'item_4', name: 'Croissant', description: 'French bakery food, pastry' },
        { id: 'item_7', name: 'Baguette', description: 'French bakery food, bread' }
      ]
    })

    expect(promptText).toContain('Current app context')
    expect(promptText).toContain('Croissant')
    expect(plan.toolName).toBe('select_items')
    expect(plan.input).toEqual({
      ids: ['item_4', 'item_7']
    })
  })

  it('plans checklist selection clearing', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Clear the selection', [])

    expect(plan.toolName).toBe('clear_item_selection')
    expect(plan.input).toEqual({})
  })

  it('requires a user key for browser-key remote providers', async () => {
    const planner = await createConfiguredPlanner({
      provider: 'openrouter',
      model: 'openrouter/auto',
      auth: {
        mode: 'user-key'
      }
    })
    const plan = await planner.plan('Select all the items that are French food.', [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(planner.status).toBe('needs-key')
    expect(plan.toolName).toBe('select_items')
    expect(plan.reason).toContain('needs a user API key')
  })

  it('plans through OpenRouter with a user key in the browser', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              toolName: 'select_items',
              input: { ids: ['item_4', 'item_7'] },
              confidence: 0.92,
              reason: 'OpenRouter selected French foods.'
            })
          }
        }
      ]
    })))
    vi.stubGlobal('fetch', fetch)

    const planner = await createConfiguredPlanner({
      provider: 'openrouter',
      model: 'openrouter/auto',
      auth: {
        mode: 'user-key',
        apiKey: 'test-key'
      }
    })
    const plan = await planner.plan('Select all the foods that are French', [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(planner.name).toBe('OpenRouter')
    expect(plan.input).toEqual({
      ids: ['item_4', 'item_7']
    })
    expect(fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-key'
      })
    }))
  })

  it('plans through a server endpoint without browser secrets', async () => {
    const fetch = vi.fn(async () => Response.json({
      toolName: 'search_products',
      input: { query: 'dock' },
      confidence: 0.88,
      reason: 'Server planner selected search.'
    }))
    vi.stubGlobal('fetch', fetch)

    const planner = await createConfiguredPlanner({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/plan'
      }
    })
    const plan = await planner.plan('Find dock products', [
      {
        name: 'search_products',
        description: 'Search products.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(plan.toolName).toBe('search_products')
    expect(fetch).toHaveBeenCalledWith('/api/webmcp/plan', expect.objectContaining({
      body: expect.stringContaining('"provider":"openai"')
    }))
    const fetchOptions = (fetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1]
    expect(String(fetchOptions?.body)).not.toContain('test-key')
  })

  it('includes server endpoint error details in fallback reasons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: 'Cloudflare Workers AI server mode needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server, or a custom planner endpoint.'
    }, {
      status: 502
    })))

    const planner = await createConfiguredPlanner({
      provider: 'cloudflare-workers-ai',
      model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/plan'
      }
    })
    const plan = await planner.plan('Select all liquids', [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(plan.reason).toContain('CLOUDFLARE_ACCOUNT_ID')
    expect(plan.reason).toContain('custom planner endpoint')
  })

  it('plans through a Cloudflare binding server endpoint with the selected model', async () => {
    const fetch = vi.fn(async () => Response.json({
      toolName: 'select_items',
      input: { ids: ['item_3', 'item_9'] },
      confidence: 0.9,
      reason: 'Cloudflare binding selected roots.'
    }))
    vi.stubGlobal('fetch', fetch)

    const planner = await createConfiguredPlanner({
      provider: 'cloudflare-binding',
      model: '@cf/qwen/qwq-32b',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/plan'
      }
    })
    const plan = await planner.plan('Select all roots', [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(planner.name).toBe('Cloudflare binding')
    expect(plan.input).toEqual({
      ids: ['item_3', 'item_9']
    })
    expect(fetch).toHaveBeenCalledWith('/api/webmcp/plan', expect.objectContaining({
      body: expect.stringContaining('"provider":"cloudflare-binding"')
    }))
    const fetchOptions = (fetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1]
    expect(String(fetchOptions?.body)).toContain('"model":"@cf/qwen/qwq-32b"')
  })

  it('does not allow Cloudflare binding mode without a server endpoint', async () => {
    const planner = await createConfiguredPlanner({
      provider: 'cloudflare-binding',
      auth: {
        mode: 'none'
      }
    })

    expect(planner.available).toBe(false)
    expect(planner.status).toBe('unavailable')
    expect(planner.detail).toContain('server endpoint mode')
  })
})
