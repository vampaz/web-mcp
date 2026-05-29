import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createBestPlanner,
  createChromeAIPlanner,
  createConfiguredPlanner,
  createHeuristicPlanner
} from './planner'
import type { JsonSchema, WebMCPTool } from './interfaces/tool'

interface WindowWithLanguageModel extends Window {
  LanguageModel?: {
    availability: (
      options?: unknown
    ) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
    create: (options?: unknown) => Promise<{
      prompt: (message: string) => Promise<string>
      destroy?: () => void
      dispose?: () => void
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
    const plan = await planner.plan('Create an invoice for Acme for 250 euros', [
      createTool('create_invoice', 'Create a draft invoice for a customer.', {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          amount: { type: 'number' }
        },
        required: ['customerName', 'amount'],
        additionalProperties: false
      })
    ])

    expect(planner.status).toBe('fallback')
    expect(plan.toolName).toBe('create_invoice')
    expect(plan.input.amount).toBe(250)
  })

  it('uses Chrome AI as the active planner when the model is downloadable', async () => {
    const create = vi.fn(async () => ({
      prompt: async () =>
        JSON.stringify({
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
    const plan = await planner.plan('Select all the foods that are French', [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute() {
          return []
        }
      }
    ])

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
      prompt: async () =>
        JSON.stringify({
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

    const plan = await planner.plan('Find docks', [
      {
        name: 'search_products',
        description: 'Search products.',
        inputSchema: {
          type: 'object'
        },
        execute() {
          return []
        }
      }
    ])

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
    const plan = await planner.plan('Add ten keyboards to the cart.', [createCartTool()])

    expect(planner.available).toBe(true)
    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input.quantity).toBe(10)
    expect(plan.reason).toContain('Used deterministic fallback')
  })

  it('does not fall back when Chrome AI is explicitly selected', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('user activation required')
      }
    }

    const planner = await createConfiguredPlanner({
      provider: 'chrome-built-in',
      auth: {
        mode: 'none'
      }
    })

    await expect(planner.plan('Add ten keyboards to the cart.', [])).rejects.toThrow(
      'Chrome built-in AI could not plan this command'
    )
  })

  it('reports malformed Chrome AI JSON distinctly before falling back', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => 'not json'
      })
    }

    const planner = await createChromeAIPlanner()
    const plan = await planner.plan('Find docks', [
      createTool('search_products', 'Search products.', {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query'],
        additionalProperties: false
      })
    ])

    expect(plan.toolName).toBe('search_products')
    expect(plan.reason).toContain('Chrome built-in AI returned unparseable JSON')
  })

  it('falls back if Chrome AI chooses an unavailable tool', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () =>
          JSON.stringify({
            toolName: 'delete_everything',
            input: {},
            confidence: 0.9,
            reason: 'Bad tool choice.'
          })
      })
    }

    const planner = await createChromeAIPlanner()
    const plan = await planner.plan('Find docks', [
      {
        name: 'search_products',
        description: 'Search products.',
        inputSchema: {
          type: 'object'
        },
        execute() {
          return []
        }
      }
    ])

    expect(plan.toolName).toBe('search_products')
    expect(plan.reason).toContain('provider selected unknown tool "delete_everything"')
  })

  it('disposes Chrome AI sessions when the planner is disposed', async () => {
    const destroy = vi.fn()
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        destroy,
        prompt: async () =>
          JSON.stringify({
            toolName: 'search_products',
            input: { query: 'dock' },
            confidence: 0.9,
            reason: 'Chrome chose product search.'
          })
      })
    }

    const planner = await createChromeAIPlanner()
    await planner.plan('Find docks', [
      {
        name: 'search_products',
        description: 'Search products.',
        inputSchema: {
          type: 'object'
        },
        execute() {
          return []
        }
      }
    ])
    planner.dispose?.()

    expect(destroy).toHaveBeenCalledOnce()
  })

  it('creates a direct heuristic planner', () => {
    const planner = createHeuristicPlanner()

    expect(planner.status).toBe('fallback')
    expect(planner.available).toBe(true)
  })

  it('extracts word quantities for cart commands', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Add ten keyboards to the cart.', [createCartTool()], {
      products: [{ id: 'product_keyboard', name: 'Keyboard kit' }]
    })

    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input).toEqual({
      productId: 'product_keyboard',
      quantity: 10
    })
  })

  it('does not match number words inside larger words', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Add stone keyboards to the cart.', [createCartTool()], {
      products: [{ id: 'product_keyboard', name: 'Keyboard kit' }]
    })

    expect(plan.input).toEqual({
      productId: 'product_keyboard',
      quantity: 1
    })
  })

  it('extracts numeric quantities for cart commands', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Add 12 docks to the cart.', [createCartTool()], {
      products: [{ id: 'product_dock', name: 'Dock' }]
    })

    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input).toEqual({
      productId: 'product_dock',
      quantity: 12
    })
  })

  it('routes checkout commands to the confirmed checkout tool', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Checkout the cart.', [createCheckoutTool()])

    expect(plan.toolName).toBe('checkout_cart')
    expect(plan.input).toEqual({})
  })

  it('plans positional checklist selection', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Select the first five items', [createSelectItemsTool()], {
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

  it('plans checklist selection from visible item names in current app context', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Select all items with water', [createSelectItemsTool()], {
      checklistItems: [
        { id: 'item_1', name: 'Apple' },
        { id: 'item_8', name: 'Water' },
        { id: 'item_16', name: 'Sparkling water' },
        { id: 'item_20', name: 'Tea' }
      ]
    })

    expect(plan.toolName).toBe('select_items')
    expect(plan.input).toEqual({
      ids: ['item_8', 'item_16']
    })
  })

  it('infers semantic checklist groups from visible item names', async () => {
    const planner = createHeuristicPlanner()
    const tools = [createSelectItemsTool()]
    const context = {
      checklistItems: [
        { id: 'item_1', name: 'Apple' },
        { id: 'item_4', name: 'French croissant' },
        { id: 'item_7', name: 'French baguette' },
        { id: 'item_8', name: 'Water' },
        { id: 'item_10', name: 'Coffee' },
        { id: 'item_13', name: 'French brie' },
        { id: 'item_16', name: 'Sparkling water' },
        { id: 'item_18', name: 'French pain au chocolat' },
        { id: 'item_20', name: 'Tea' },
        { id: 'item_22', name: 'French quiche' },
        { id: 'item_23', name: 'Pantry rice' }
      ]
    }

    await expect(planner.plan('Select all French items', tools, context)).resolves.toMatchObject({
      toolName: 'select_items',
      input: {
        ids: ['item_4', 'item_7', 'item_13', 'item_18', 'item_22']
      }
    })
    await expect(planner.plan('Select all water items', tools, context)).resolves.toMatchObject({
      toolName: 'select_items',
      input: {
        ids: ['item_8', 'item_16']
      }
    })
    await expect(planner.plan('Select all apple items', tools, context)).resolves.toMatchObject({
      toolName: 'select_items',
      input: {
        ids: ['item_1']
      }
    })
    await expect(planner.plan('Select all pantry items', tools, context)).resolves.toMatchObject({
      toolName: 'select_items',
      input: {
        ids: ['item_23']
      }
    })
  })

  it('plans inventory table sorting from column wording', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Sort inventory by stock highest first', [
      {
        name: 'sort_inventory',
        description: 'Sort the visible inventory table by a supported column.',
        inputSchema: {
          type: 'object',
          properties: {
            sortBy: { type: 'string', enum: ['name', 'stock'] },
            direction: { type: 'string', enum: ['asc', 'desc'] }
          },
          required: ['sortBy'],
          additionalProperties: false
        },
        execute() {
          return []
        }
      }
    ])

    expect(plan).toMatchObject({
      toolName: 'sort_inventory',
      input: {
        direction: 'desc',
        sortBy: 'stock'
      }
    })
  })

  it('uses the schema default when direction enum values are not asc or desc', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Sort by stock descending', [
      createTool('sort_inventory', 'Sort inventory.', {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down'] }
        },
        required: ['direction'],
        additionalProperties: false
      })
    ])

    expect(plan.input).toEqual({
      direction: 'up'
    })
  })

  it('plans invoice selection from visible customer wording', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan(
      'Select Globex invoices',
      [
        {
          name: 'select_invoices',
          description: 'Select invoice rows by ID.',
          inputSchema: {
            type: 'object',
            properties: {
              ids: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['ids'],
            additionalProperties: false
          },
          execute: () => []
        }
      ],
      {
        invoices: [
          { id: 'inv_1', customerName: 'Northwind', amount: 920, status: 'overdue' },
          { id: 'inv_2', customerName: 'Initech', amount: 640, status: 'paid' },
          { id: 'inv_3', customerName: 'Aperture Labs', amount: 1480, status: 'draft' },
          { id: 'inv_4', customerName: 'Globex', amount: 230, status: 'sent' }
        ]
      }
    )

    expect(plan.toolName).toBe('select_invoices')
    expect(plan.input).toEqual({
      ids: ['inv_4']
    })
  })

  it('plans invoice opening from the visible customer name', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan(
      'Open the Stark invoice',
      [
        {
          name: 'open_invoice',
          description: 'Open invoice detail.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' }
            },
            required: ['id'],
            additionalProperties: false
          },
          execute: () => []
        }
      ],
      {
        invoices: [
          { id: 'inv_1', customerName: 'Northwind', amount: 920, status: 'overdue' },
          { id: 'inv_2', customerName: 'Stark Industries', amount: 2310, status: 'overdue' }
        ]
      }
    )

    expect(plan.toolName).toBe('open_invoice')
    expect(plan.input).toEqual({
      id: 'inv_2'
    })
  })

  it('plans invoice status changes from matching schema enum values', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan(
      'Mark Stark Industries invoices as paid',
      [
        {
          name: 'select_invoices',
          description: 'Select invoice rows by ID.',
          inputSchema: {
            type: 'object',
            properties: {
              ids: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['ids'],
            additionalProperties: false
          },
          execute: () => []
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
          },
          execute: () => []
        }
      ],
      {
        invoices: [
          { id: 'inv_1', customerName: 'Northwind', amount: 920, status: 'overdue' },
          { id: 'inv_2', customerName: 'Stark Industries', amount: 2310, status: 'overdue' }
        ]
      }
    )

    expect(plan).toMatchObject({
      toolName: 'update_selected_invoice_status',
      input: {
        status: 'paid'
      }
    })
  })

  it('keeps single-step invoice status changes single-step', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan(
      'Mark invoices as paid',
      [
        {
          name: 'select_invoices',
          description: 'Select invoice rows by ID.',
          inputSchema: {
            type: 'object',
            properties: {
              ids: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['ids'],
            additionalProperties: false
          },
          execute: () => []
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
          },
          execute: () => []
        }
      ],
      {
        invoices: [
          { id: 'inv_1', customerName: 'Northwind', amount: 920, status: 'overdue' },
          { id: 'inv_2', customerName: 'Stark Industries', amount: 2310, status: 'overdue' }
        ]
      }
    )

    expect(plan).toMatchObject({
      toolName: 'update_selected_invoice_status',
      input: {
        status: 'paid'
      }
    })
    expect(plan.steps).toBeUndefined()
  })

  it('returns empty IDs when context cannot ground a selection request', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Select all the items that are French food.', [
      createSelectItemsTool(),
      createTool('search_products', 'Search products.', {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query'],
        additionalProperties: false
      })
    ])

    expect(plan).toMatchObject({
      toolName: 'select_items',
      input: {
        ids: []
      }
    })
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
    const plan = await planner.plan(
      'Select all the foods that are French',
      [
        {
          name: 'select_items',
          description: 'Select checklist items by ID.',
          inputSchema: {
            type: 'object'
          },
          execute() {
            return []
          }
        }
      ],
      {
        checklistItems: [
          { id: 'item_4', name: 'Croissant', description: 'French bakery food, pastry' },
          { id: 'item_7', name: 'Baguette', description: 'French bakery food, bread' }
        ]
      }
    )

    expect(promptText).toContain('Current app context')
    expect(promptText).toContain('Croissant')
    expect(plan.toolName).toBe('select_items')
    expect(plan.input).toEqual({
      ids: ['item_4', 'item_7']
    })
  })

  it('plans checklist selection clearing', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Clear the selection', [
      createTool('clear_item_selection', 'Clear the current item selection.', {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      })
    ])

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
    const tools = [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ]

    expect(planner.status).toBe('needs-key')
    await expect(planner.plan('Select all the items that are French food.', tools)).rejects.toThrow(
      'OpenRouter needs a user API key'
    )
  })

  it('plans through OpenRouter with a user key in the browser', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `Here is the plan:\n\n\`\`\`json\n${JSON.stringify({
                    toolName: 'select_items',
                    input: { ids: ['item_4', 'item_7'] },
                    confidence: 0.92,
                    reason: 'OpenRouter selected French foods.'
                  })}\n\`\`\``
                }
              }
            ]
          })
        )
    )
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
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key'
        })
      })
    )
  })

  it('rejects remote planner input that does not match the selected tool schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          toolName: 'select_items',
          input: {},
          confidence: 0.88,
          reason: 'Server planner selected the tool but omitted input.'
        })
      )
    )

    const planner = await createConfiguredPlanner({
      provider: 'cloudflare-binding',
      model: '@cf/qwen/qwq-32b',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/plan'
      }
    })

    await expect(
      planner.plan('Select all liquids', [
        {
          name: 'select_items',
          description: 'Select checklist items by ID.',
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
          },
          execute: () => []
        }
      ])
    ).rejects.toThrow('provider returned invalid input')
  })

  it('plans through a server endpoint without browser secrets', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        toolName: 'search_products',
        input: { query: 'dock' },
        confidence: 0.88,
        reason: 'Server planner selected search.'
      })
    )
    vi.stubGlobal('fetch', fetch)

    const planner = await createConfiguredPlanner({
      provider: 'openai',
      model: 'gpt-5.4-mini',
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
    expect(fetch).toHaveBeenCalledWith(
      '/api/webmcp/plan',
      expect.objectContaining({
        body: expect.stringContaining('"provider":"openai"')
      })
    )
    const fetchOptions = (fetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1]
    expect(String(fetchOptions?.body)).not.toContain('test-key')
  })

  it('reports server endpoint error details for explicit providers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: 'OpenAI server mode needs OPENAI_API_KEY on the server.'
          },
          {
            status: 502
          }
        )
      )
    )

    const planner = await createConfiguredPlanner({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/plan'
      }
    })
    await expect(
      planner.plan('Select all liquids', [
        {
          name: 'select_items',
          description: 'Select checklist items by ID.',
          inputSchema: {
            type: 'object'
          },
          execute: () => []
        }
      ])
    ).rejects.toThrow('OPENAI_API_KEY')
  })

  it('reports cancellation without wrapping it as a provider failure', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    const planner = await createConfiguredPlanner({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/plan'
      }
    })
    controller.abort()

    await expect(
      planner.plan(
        'Find dock products',
        [
          {
            name: 'search_products',
            description: 'Search products.',
            inputSchema: {
              type: 'object'
            },
            execute: () => []
          }
        ],
        {},
        { signal: controller.signal }
      )
    ).rejects.toThrow('Planner request was cancelled.')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('plans through a Cloudflare binding server endpoint with the selected model', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        toolName: 'select_items',
        input: { ids: ['item_3', 'item_9'] },
        confidence: 0.9,
        reason: 'Cloudflare binding selected roots.'
      })
    )
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
    expect(fetch).toHaveBeenCalledWith(
      '/api/webmcp/plan',
      expect.objectContaining({
        body: expect.stringContaining('"provider":"cloudflare-binding"')
      })
    )
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

function createTool(name: string, description: string, inputSchema: JsonSchema): WebMCPTool {
  return {
    name,
    description,
    inputSchema,
    execute() {
      return []
    }
  }
}

function createCartTool(): WebMCPTool {
  return createTool('add_to_cart', 'Add a known product to the cart.', {
    type: 'object',
    properties: {
      productId: { type: 'string' },
      quantity: { type: 'integer' }
    },
    required: ['productId', 'quantity'],
    additionalProperties: false
  })
}

function createCheckoutTool(): WebMCPTool {
  return createTool('checkout_cart', 'Checkout the current cart.', {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false
  })
}

function createSelectItemsTool(): WebMCPTool {
  return createTool('select_items', 'Select visible items by stable IDs.', {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['ids'],
    additionalProperties: false
  })
}
