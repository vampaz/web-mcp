import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createBestResolver,
  createChromeAIResolver,
  createResolver,
  createHeuristicResolver
} from './resolver'
import type { JsonSchema, WebMCPTool } from './interfaces/tool'

interface WindowWithLanguageModel extends Window {
  LanguageModel?: {
    availability: (
      options?: unknown
    ) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
    create: (options?: unknown) => Promise<{
      clone?: (options?: unknown) => Promise<unknown>
      prompt: (message: string) => Promise<string>
      destroy?: () => void
      dispose?: () => void
    }>
  }
}

describe('resolver', () => {
  afterEach(() => {
    delete (window as WindowWithLanguageModel).LanguageModel
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('constrains and validates a single-step request without changing bounded Resolver mode', async function test() {
    const fetch = vi.fn(async function respond(
      _url: string | URL | Request,
      _options?: RequestInit
    ) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...(_options?.body &&
                  JSON.parse(String(_options.body)).response_format.json_schema.schema.properties
                    .action
                    ? {
                        action: {
                          toolName: 'tool_sequence',
                          input: {},
                          confidence: 1,
                          reason: 'Batch',
                          steps: []
                        }
                      }
                    : {
                        toolName: 'tool_sequence',
                        input: {},
                        confidence: 1,
                        reason: 'Batch',
                        steps: [
                          { toolName: 'read_value', input: {}, confidence: 1, reason: 'Read' }
                        ]
                      })
                })
              }
            }
          ]
        })
      )
    })
    vi.stubGlobal('fetch', fetch)
    const resolver = await createResolver({
      provider: 'openai-compatible',
      baseUrl: '/local/v1',
      responseFormat: 'json_schema'
    })
    const tools = [
      createTool('read_value', 'Read the visible value.', {
        type: 'object',
        properties: {},
        additionalProperties: false
      })
    ]
    await expect(resolver.resolve('Read', tools, {}, { singleStep: true })).rejects.toThrow(
      'single-step'
    )
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    const variants = body.response_format.json_schema.schema.properties.action.anyOf
    expect(variants.every((variant: JsonSchema) => !variant.properties?.steps)).toBe(true)
    expect(variants.flatMap((variant: JsonSchema) => variant.properties?.toolName.enum)).toContain(
      'read_value'
    )
    expect(
      variants.flatMap((variant: JsonSchema) => variant.properties?.toolName.enum)
    ).not.toContain('tool_sequence')
    expect(body.messages[0].content).toContain('exactly one')
    expect((await resolver.resolve('Read', tools)).toolName).toBe('tool_sequence')
  })

  it('sends the explicit JSON schema format required by LM Studio', async function test() {
    const fetch = vi.fn(async function respond(
      _url: string | URL | Request,
      _options?: RequestInit
    ) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  toolName: 'no_tools_match',
                  input: {},
                  confidence: 0,
                  reason: 'No application tools'
                })
              }
            }
          ]
        })
      )
    })
    vi.stubGlobal('fetch', fetch)
    const resolver = await createResolver({
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:1234/v1',
      model: 'configured',
      responseFormat: 'json_schema',
      maxTokens: 1024,
      temperature: 0.2,
      reasoningEffort: 'none'
    })
    await resolver.resolve('Hello', [])
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'webmcp_resolution', schema: { type: 'object' } }
    })
    expect(resolver.capabilities?.conversation).toBe(true)
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      max_tokens: 1024,
      temperature: 0.2,
      reasoning_effort: 'none'
    })
  })

  it('pairs structured tool arguments and fits a large tool schema within the request budget', async function test() {
    const action = {
      toolName: 'read_value',
      input: { targetId: 'one' },
      confidence: 1,
      reason: 'Read'
    }
    const fetch = vi.fn(async function respond() {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ action }) } }] })
    })
    vi.stubGlobal('fetch', fetch)
    const resolver = await createResolver({
      provider: 'openai-compatible',
      baseUrl: '/local/v1',
      responseFormat: 'json_schema'
    })
    const tools = [
      createTool('read_value', 'Read a visible value', {
        type: 'object',
        properties: {
          targetId: { type: 'string', description: 'schema-budget-detail '.repeat(250) }
        },
        required: ['targetId'],
        additionalProperties: false
      })
    ]
    await expect(
      resolver.resolve('Read one', tools, {}, { singleStep: true, maxRequestBytes: 15000 })
    ).resolves.toEqual(action)
    const body = String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body)
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(15000)
    expect(body.match(/schema-budget-detail /g)).toHaveLength(500)
    fetch.mockResolvedValueOnce(
      Response.json({
        choices: [{ message: { content: JSON.stringify({ action: { ...action, input: {} } }) } }]
      })
    )
    await expect(resolver.resolve('Read one', tools, {}, { singleStep: true })).rejects.toThrow(
      'invalid input for "read_value"'
    )
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps input schema descriptions in json_schema single-step prompts', async function test() {
    const fetch = vi.fn(async function respond() {
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: {
                  toolName: 'create_invoice',
                  input: { amount: 25000 },
                  confidence: 1,
                  reason: 'Invoice'
                }
              })
            }
          }
        ]
      })
    })
    vi.stubGlobal('fetch', fetch)
    const resolver = await createResolver({
      provider: 'openai-compatible',
      baseUrl: '/local/v1',
      responseFormat: 'json_schema'
    })
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: { amount: { type: 'integer', description: 'Total amount in euro cents.' } },
      required: ['amount'],
      additionalProperties: false
    }
    await resolver.resolve(
      'Invoice 250 euros',
      [createTool('create_invoice', 'Create an invoice.', inputSchema)],
      {},
      { singleStep: true }
    )
    // LM Studio applies response_format as an output constraint only and never shows it to the model.
    const request = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body))
    expect(request.messages[1].content).toContain(`"inputSchema":${JSON.stringify(inputSchema)}`)
    expect(
      request.response_format.json_schema.schema.properties.action.anyOf[0].properties.input
    ).toEqual(inputSchema)
  })

  it.each([
    ['json_schema', 'needs_clarification'],
    ['json_schema', 'no_tools_match'],
    ['json_object', 'needs_clarification'],
    ['json_object', 'no_tools_match']
  ] as const)(
    'accepts its own %s example for %s',
    async function example(responseFormat, toolName) {
      const fetch = vi.fn(async function respond(_url: unknown, options: RequestInit) {
        const request = JSON.parse(String(options.body))
        const instruction = request.messages[1].content.split('\n\n').find(function outcome(
          line: string
        ) {
          return line.includes(`"toolName":"${toolName}"`)
        })
        const content = instruction?.match(/return (\{.*\})\.$/)?.[1]
        expect(content).toBeDefined()
        return Response.json({ choices: [{ message: { content } }] })
      })
      vi.stubGlobal('fetch', fetch)
      const resolver = await createResolver({
        provider: 'openai-compatible',
        baseUrl: '/local/v1',
        responseFormat
      })
      await expect(resolver.resolve('Help', [], {}, { singleStep: true })).resolves.toMatchObject({
        toolName,
        input: {}
      })
    }
  )

  it.each(['json_schema', 'json_object'] as const)(
    'retains prompt input schemas for bounded %s resolution',
    async function catalog(responseFormat) {
      const fetch = vi.fn(async function respond(_url: unknown, options: RequestInit) {
        const request = JSON.parse(String(options.body))
        expect(request.messages[1].content).toContain('"required":["targetId"]')
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  toolName: 'read_value',
                  input: { targetId: 'one' },
                  confidence: 1,
                  reason: 'Read'
                })
              }
            }
          ]
        })
      })
      vi.stubGlobal('fetch', fetch)
      const resolver = await createResolver({
        provider: 'openai-compatible',
        baseUrl: '/local/v1',
        responseFormat
      })
      await expect(
        resolver.resolve('Read one', [
          createTool('read_value', 'Read', {
            type: 'object',
            properties: { targetId: { type: 'string' } },
            required: ['targetId']
          })
        ])
      ).resolves.toMatchObject({ input: { targetId: 'one' } })
    }
  )

  it('uses a deterministic fallback resolver without Chrome built-in AI', async () => {
    const resolver = await createBestResolver()
    const resolution = await resolver.resolve('Create an invoice for Acme for 250 euros', [
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

    expect(resolver.status).toBe('fallback')
    expect(resolution.toolName).toBe('create_invoice')
    expect(resolution.input.amount).toBe(250)
  })

  it('uses Chrome AI as the active resolver when the model is downloadable', async () => {
    const create = vi.fn(async () => ({
      async clone(this: { prompt: (message: string) => Promise<string> }) {
        return { prompt: this.prompt, destroy: vi.fn() }
      },
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

    const resolver = await createBestResolver()
    const resolution = await resolver.resolve('Select all the foods that are French', [
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

    expect(resolver.available).toBe(true)
    expect(resolver.status).toBe('downloadable')
    expect(resolution.toolName).toBe('select_items')
    expect(resolution.input).toEqual({
      ids: ['item_4', 'item_7']
    })
    expect(create).toHaveBeenCalledOnce()
  })

  it('uses Chrome built-in AI when available', async () => {
    const create = vi.fn(async () => ({
      async clone(this: { prompt: (message: string) => Promise<string> }) {
        return { prompt: this.prompt, destroy: vi.fn() }
      },
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

    const resolver = await createChromeAIResolver()
    expect(create).not.toHaveBeenCalled()

    const resolution = await resolver.resolve('Find docks', [
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

    expect(resolver.available).toBe(true)
    expect(resolver.status).toBe('ready')
    expect(resolution.toolName).toBe('search_products')
    expect(create).toHaveBeenCalledOnce()
  })

  it('falls back if Chrome AI session creation fails after user activation', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('user activation required')
      }
    }

    const resolver = await createChromeAIResolver()
    const resolution = await resolver.resolve(
      'Add ten keyboards to the cart.',
      [createCartTool()],
      {
        products: [{ id: 'keyboard', name: 'Keyboard' }]
      }
    )

    expect(resolver.available).toBe(true)
    expect(resolution.toolName).toBe('add_to_cart')
    expect(resolution.input.quantity).toBe(10)
    expect(resolution.reason).toContain('Used deterministic fallback')
  })

  it('does not start Chrome inference after cancellation during session creation', async function test() {
    let activate!: (session: { prompt: () => Promise<string> }) => void
    const prompt = vi.fn(async function reply() {
      return JSON.stringify({
        toolName: 'no_tools_match',
        input: {},
        confidence: 0,
        reason: 'None'
      })
    })
    ;(window as WindowWithLanguageModel).LanguageModel = {
      async availability() {
        return 'available'
      },
      create() {
        return new Promise(function pending(resolve) {
          activate = resolve
        })
      }
    }
    const resolver = await createChromeAIResolver(true)
    const controller = new AbortController()
    const pending = resolver.resolve('Read', [], {}, { signal: controller.signal })
    controller.abort()
    activate({ prompt })
    await expect(pending).rejects.toThrow('cancelled')
    expect(prompt).not.toHaveBeenCalled()
    resolver.dispose?.()
  })

  it('shares pending Chrome sessions and destroys sessions that finish after disposal', async function test() {
    let activate!: (session: { prompt: () => Promise<string>; destroy: () => void }) => void
    const create = vi.fn(function create() {
      return new Promise<{ prompt: () => Promise<string>; destroy: () => void }>(
        function pending(resolve) {
          activate = resolve
        }
      )
    })
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create
    }
    const resolver = await createChromeAIResolver()
    const first = resolver.resolve('Find products', [])
    const second = resolver.resolve('Find products', [])
    const results = Promise.allSettled([first, second])
    resolver.dispose?.()
    const prompt = vi.fn()
    const destroy = vi.fn()
    activate({ prompt, destroy })
    expect(
      (await results).map(function status(value) {
        return value.status
      })
    ).toEqual(['rejected', 'rejected'])
    expect(create).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
    expect(prompt).not.toHaveBeenCalled()
  })

  it('asks for clarification instead of guessing an unmatched or ambiguous object ID', async function test() {
    const resolver = createHeuristicResolver()
    for (const products of [
      [{ id: 'a', name: 'Apple' }],
      [
        { id: 'a', name: 'Keyboard A' },
        { id: 'b', name: 'Keyboard B' }
      ]
    ]) {
      const resolution = await resolver.resolve('Add a keyboard to the cart', [createCartTool()], {
        products
      })
      expect(resolution.toolName).toBe('needs_clarification')
    }
  })

  it('passes request cancellation to Chrome inference', async function test() {
    const prompt = vi.fn(async function reply(_message: string, _options?: unknown) {
      return JSON.stringify({
        toolName: 'no_tools_match',
        input: {},
        confidence: 0,
        reason: 'None'
      })
    })
    ;(window as WindowWithLanguageModel).LanguageModel = {
      async availability() {
        return 'available'
      },
      async create() {
        return {
          prompt,
          async clone() {
            return { prompt, destroy: vi.fn() }
          }
        }
      }
    }
    const resolver = await createChromeAIResolver(true)
    const controller = new AbortController()
    await resolver.resolve('Read', [], {}, { signal: controller.signal })
    expect(prompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal })
    )
    resolver.dispose?.()
  })

  it('does not fall back when Chrome AI is explicitly selected', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('user activation required')
      }
    }

    const resolver = await createResolver({
      provider: 'chrome-built-in'
    })

    await expect(resolver.resolve('Add ten keyboards to the cart.', [])).rejects.toThrow(
      'Chrome built-in AI could not resolve this command'
    )
  })

  it('reports malformed Chrome AI JSON distinctly before falling back', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        async clone(this: { prompt: (message: string) => Promise<string> }) {
          return { prompt: this.prompt, destroy: vi.fn() }
        },
        prompt: async () => 'not json'
      })
    }

    const resolver = await createChromeAIResolver()
    const resolution = await resolver.resolve('Find docks', [
      createTool('search_products', 'Search products.', {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query'],
        additionalProperties: false
      })
    ])

    expect(resolution.toolName).toBe('search_products')
    expect(resolution.reason).toContain('Chrome built-in AI returned unparseable JSON')
  })

  it('falls back if Chrome AI chooses an unavailable tool', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        async clone(this: { prompt: (message: string) => Promise<string> }) {
          return { prompt: this.prompt, destroy: vi.fn() }
        },
        prompt: async () =>
          JSON.stringify({
            toolName: 'delete_everything',
            input: {},
            confidence: 0.9,
            reason: 'Bad tool choice.'
          })
      })
    }

    const resolver = await createChromeAIResolver()
    const resolution = await resolver.resolve('Find docks', [
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

    expect(resolution.toolName).toBe('search_products')
    expect(resolution.reason).toContain('provider selected unknown tool "delete_everything"')
  })

  it('disposes Chrome AI sessions when the resolver is disposed', async () => {
    const destroy = vi.fn()
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        destroy,
        async clone(this: { prompt: (message: string) => Promise<string> }) {
          return { prompt: this.prompt, destroy: vi.fn() }
        },
        prompt: async () =>
          JSON.stringify({
            toolName: 'search_products',
            input: { query: 'dock' },
            confidence: 0.9,
            reason: 'Chrome chose product search.'
          })
      })
    }

    const resolver = await createChromeAIResolver()
    await resolver.resolve('Find docks', [
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
    resolver.dispose?.()

    expect(destroy).toHaveBeenCalledOnce()
  })

  it('creates a direct heuristic resolver', () => {
    const resolver = createHeuristicResolver()

    expect(resolver.status).toBe('fallback')
    expect(resolver.available).toBe(true)
  })

  it('extracts word quantities for cart commands', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve(
      'Add ten keyboards to the cart.',
      [createCartTool()],
      {
        products: [{ id: 'product_keyboard', name: 'Keyboard kit' }]
      }
    )

    expect(resolution.toolName).toBe('add_to_cart')
    expect(resolution.input).toEqual({
      productId: 'product_keyboard',
      quantity: 10
    })
  })

  it('returns no_tools_match when the local resolver has no matching tool', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve('Make coffee for the team', [
      createTool('search_products', 'Search visible products.', {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query'],
        additionalProperties: false
      })
    ])

    expect(resolution).toEqual({
      toolName: 'no_tools_match',
      input: {},
      confidence: 0,
      reason: 'No registered WebMCP tool matched this request closely enough to run.'
    })
  })

  it('returns needs_clarification when required IDs are missing from context', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve('Select the water items', [createSelectItemsTool()], {
      checklistItems: [{ id: 'item_1', name: 'Apple' }]
    })

    expect(resolution).toEqual({
      toolName: 'needs_clarification',
      input: {},
      confidence: 0,
      reason:
        'The request matched a tool, but the request and current app context did not supply valid required inputs.'
    })
  })

  it('does not match number words inside larger words', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve(
      'Add stone keyboards to the cart.',
      [createCartTool()],
      {
        products: [{ id: 'product_keyboard', name: 'Keyboard kit' }]
      }
    )

    expect(resolution.toolName).toBe('needs_clarification')
  })

  it.each([{ type: 'boolean' }, { type: 'number' }, { type: 'string', enum: ['red', 'blue'] }])(
    'asks instead of inventing a required value for %j',
    async (schema) => {
      const result = await createHeuristicResolver().resolve('Update setting', [
        createTool('update_setting', 'Update the setting value.', {
          type: 'object',
          properties: { value: schema },
          required: ['value'],
          additionalProperties: false
        })
      ])
      expect(result.toolName).toBe('needs_clarification')
    }
  )

  it('uses a fresh clone per Chrome request and destroys each clone', async () => {
    const destroyBase = vi.fn()
    const destroyClone = vi.fn()
    const prompt = vi.fn(async () =>
      JSON.stringify({ toolName: 'no_tools_match', input: {}, confidence: 0, reason: 'None' })
    )
    const clone = vi.fn(async () => ({ prompt, destroy: destroyClone }))
    Reflect.set(window, 'LanguageModel', {
      availability: async () => 'available',
      create: async () => ({ clone, destroy: destroyBase })
    })
    const resolver = await createChromeAIResolver(true)
    await resolver.resolve('First request', [])
    await resolver.resolve('Second request', [])
    expect(clone).toHaveBeenCalledTimes(2)
    expect(destroyClone).toHaveBeenCalledTimes(2)
    expect(destroyBase).not.toHaveBeenCalled()
    resolver.dispose?.()
    expect(destroyBase).toHaveBeenCalledOnce()
  })

  it('extracts numeric quantities for cart commands', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve('Add 12 docks to the cart.', [createCartTool()], {
      products: [{ id: 'product_dock', name: 'Dock' }]
    })

    expect(resolution.toolName).toBe('add_to_cart')
    expect(resolution.input).toEqual({
      productId: 'product_dock',
      quantity: 12
    })
  })

  it('routes checkout commands to the confirmed checkout tool', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve('Checkout the cart.', [createCheckoutTool()])

    expect(resolution.toolName).toBe('checkout_cart')
    expect(resolution.input).toEqual({})
  })

  it('resolves positional checklist selection', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve(
      'Select the first five items',
      [createSelectItemsTool()],
      {
        checklistItems: [
          { id: 'item_1' },
          { id: 'item_2' },
          { id: 'item_3' },
          { id: 'item_4' },
          { id: 'item_5' },
          { id: 'item_6' }
        ]
      }
    )

    expect(resolution.toolName).toBe('select_items')
    expect(resolution.input).toEqual({
      ids: ['item_1', 'item_2', 'item_3', 'item_4', 'item_5']
    })
  })

  it('resolves checklist selection from visible item names in current app context', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve(
      'Select all items with water',
      [createSelectItemsTool()],
      {
        checklistItems: [
          { id: 'item_1', name: 'Apple' },
          { id: 'item_8', name: 'Water' },
          { id: 'item_16', name: 'Sparkling water' },
          { id: 'item_20', name: 'Tea' }
        ]
      }
    )

    expect(resolution.toolName).toBe('select_items')
    expect(resolution.input).toEqual({
      ids: ['item_8', 'item_16']
    })
  })

  it('infers semantic checklist groups from visible item names', async () => {
    const resolver = createHeuristicResolver()
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

    await expect(
      resolver.resolve('Select all French items', tools, context)
    ).resolves.toMatchObject({
      toolName: 'select_items',
      input: {
        ids: ['item_4', 'item_7', 'item_13', 'item_18', 'item_22']
      }
    })
    await expect(resolver.resolve('Select all water items', tools, context)).resolves.toMatchObject(
      {
        toolName: 'select_items',
        input: {
          ids: ['item_8', 'item_16']
        }
      }
    )
    await expect(resolver.resolve('Select all apple items', tools, context)).resolves.toMatchObject(
      {
        toolName: 'select_items',
        input: {
          ids: ['item_1']
        }
      }
    )
    await expect(
      resolver.resolve('Select all pantry items', tools, context)
    ).resolves.toMatchObject({
      toolName: 'select_items',
      input: {
        ids: ['item_23']
      }
    })
  })

  it('resolves inventory table sorting from column wording', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve('Sort inventory by stock highest first', [
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

    expect(resolution).toMatchObject({
      toolName: 'sort_inventory',
      input: {
        direction: 'desc',
        sortBy: 'stock'
      }
    })
  })

  it('uses the schema default when direction enum values are not asc or desc', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve('Sort by stock descending', [
      createTool('sort_inventory', 'Sort inventory.', {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down'], default: 'up' }
        },
        required: ['direction'],
        additionalProperties: false
      })
    ])

    expect(resolution.input).toEqual({
      direction: 'up'
    })
  })

  it('resolves invoice selection from visible customer wording', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve(
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

    expect(resolution.toolName).toBe('select_invoices')
    expect(resolution.input).toEqual({
      ids: ['inv_4']
    })
  })

  it('resolves invoice opening from the visible customer name', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve(
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

    expect(resolution.toolName).toBe('open_invoice')
    expect(resolution.input).toEqual({
      id: 'inv_2'
    })
  })

  it('resolves invoice status changes from matching schema enum values', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve(
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

    expect(resolution).toMatchObject({
      toolName: 'update_selected_invoice_status',
      input: {
        status: 'paid'
      }
    })
  })

  it('keeps single-step invoice status changes single-step', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve(
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

    expect(resolution).toMatchObject({
      toolName: 'update_selected_invoice_status',
      input: {
        status: 'paid'
      }
    })
    expect(resolution.steps).toBeUndefined()
  })

  it('asks for clarification when context cannot ground a selection request', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve('Select all the items that are French food.', [
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

    expect(resolution).toMatchObject({
      toolName: 'needs_clarification',
      input: {}
    })
  })

  it('passes app context to Chrome AI for semantic selection', async () => {
    let promptText = ''
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        async clone(this: { prompt: (message: string) => Promise<string> }) {
          return { prompt: this.prompt, destroy: vi.fn() }
        },
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

    const resolver = await createChromeAIResolver()
    const resolution = await resolver.resolve(
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
    expect(resolution.toolName).toBe('select_items')
    expect(resolution.input).toEqual({
      ids: ['item_4', 'item_7']
    })
  })

  it('resolves checklist selection clearing', async () => {
    const resolver = createHeuristicResolver()
    const resolution = await resolver.resolve('Clear the selection', [
      createTool('clear_item_selection', 'Clear the current item selection.', {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      })
    ])

    expect(resolution.toolName).toBe('clear_item_selection')
    expect(resolution.input).toEqual({})
  })

  it('requires a user key for browser-key remote providers', async () => {
    const resolver = await createResolver({
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

    expect(resolver.status).toBe('needs-key')
    await expect(
      resolver.resolve('Select all the items that are French food.', tools)
    ).rejects.toThrow('OpenRouter needs a user API key')
  })

  it('resolves through OpenRouter with a user key in the browser', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `Here is the resolution:\n\n\`\`\`json\n${JSON.stringify({
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

    const resolver = await createResolver({
      provider: 'openrouter',
      model: 'openrouter/auto',
      auth: {
        mode: 'user-key',
        apiKey: 'test-key'
      }
    })
    const resolution = await resolver.resolve('Select all the foods that are French', [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(resolver.name).toBe('OpenRouter')
    expect(resolution.input).toEqual({
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

  it('rejects remote resolver input that does not match the selected tool schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          toolName: 'select_items',
          input: {},
          confidence: 0.88,
          reason: 'Server resolver selected the tool but omitted input.'
        })
      )
    )

    const resolver = await createResolver({
      provider: 'cloudflare-binding',
      model: '@cf/qwen/qwq-32b',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/resolve'
      }
    })

    await expect(
      resolver.resolve('Select all liquids', [
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

  it('resolves through a server endpoint without browser secrets', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        toolName: 'search_products',
        input: { query: 'dock' },
        confidence: 0.88,
        reason: 'Server resolver selected search.'
      })
    )
    vi.stubGlobal('fetch', fetch)

    const resolver = await createResolver({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/resolve'
      }
    })
    const resolution = await resolver.resolve('Find dock products', [
      {
        name: 'search_products',
        description: 'Search products.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(resolution.toolName).toBe('search_products')
    expect(fetch).toHaveBeenCalledWith(
      '/api/webmcp/resolve',
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

    const resolver = await createResolver({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/resolve'
      }
    })
    await expect(
      resolver.resolve('Select all liquids', [
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
    const resolver = await createResolver({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/resolve'
      }
    })
    controller.abort()

    await expect(
      resolver.resolve(
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
    ).rejects.toThrow('Resolver request was cancelled.')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('resolves through a Cloudflare binding server endpoint with the selected model', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        toolName: 'select_items',
        input: { ids: ['item_3', 'item_9'] },
        confidence: 0.9,
        reason: 'Cloudflare binding selected roots.'
      })
    )
    vi.stubGlobal('fetch', fetch)

    const resolver = await createResolver({
      provider: 'cloudflare-binding',
      model: '@cf/qwen/qwq-32b',
      auth: {
        mode: 'server',
        endpoint: '/api/webmcp/resolve'
      }
    })
    const resolution = await resolver.resolve('Select all roots', [
      {
        name: 'select_items',
        description: 'Select checklist items by ID.',
        inputSchema: {
          type: 'object'
        },
        execute: () => []
      }
    ])

    expect(resolver.name).toBe('Cloudflare binding')
    expect(resolution.input).toEqual({
      ids: ['item_3', 'item_9']
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/webmcp/resolve',
      expect.objectContaining({
        body: expect.stringContaining('"provider":"cloudflare-binding"')
      })
    )
    const fetchOptions = (fetch.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1]
    expect(String(fetchOptions?.body)).toContain('"model":"@cf/qwen/qwq-32b"')
  })

  it('does not allow Cloudflare binding mode without a server endpoint', async () => {
    const resolver = await createResolver({
      provider: 'cloudflare-binding',
      auth: {
        mode: 'none'
      }
    })

    expect(resolver.available).toBe(false)
    expect(resolver.status).toBe('unavailable')
    expect(resolver.detail).toContain('server endpoint mode')
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
