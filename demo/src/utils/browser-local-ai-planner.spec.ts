import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBrowserLocalAIPlanner } from './browser-local-ai-planner'

const webLLMMocks = vi.hoisted(() => ({
  createMLCEngine: vi.fn()
}))

vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: webLLMMocks.createMLCEngine
}))

describe('browser local AI planner', () => {
  afterEach(() => {
    webLLMMocks.createMLCEngine.mockReset()
    vi.unstubAllGlobals()
  })

  it('reports WebGPU support errors without loading WebLLM', async () => {
    const planner = createBrowserLocalAIPlanner()

    await expect(planner.plan('Select all French items', [])).rejects.toThrow(
      'Browser local AI needs WebGPU support'
    )
    expect(webLLMMocks.createMLCEngine).not.toHaveBeenCalled()
  })

  it('plans semantic selection through WebLLM JSON output', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      gpu: {
        requestAdapter: async () => ({})
      }
    })
    const completionCreate = vi.fn(async function createCompletion(
      _request: Record<string, unknown>
    ) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                toolName: 'select_items',
                input: {
                  ids: ['item_4', 'item_7']
                },
                confidence: 0.91,
                reason: 'Selected French items from current inventory context.'
              })
            }
          }
        ]
      }
    })
    webLLMMocks.createMLCEngine.mockResolvedValue({
      chat: {
        completions: {
          create: completionCreate
        }
      },
      unload: vi.fn()
    })
    const planner = createBrowserLocalAIPlanner({
      model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC'
    })
    const tools = [
      {
        name: 'select_items',
        description: 'Select visible inventory items by stable item IDs.',
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
    ]

    const plan = await planner.plan('Select all French items', tools, {
      checklistItems: [
        { id: 'item_1', name: 'Apple' },
        { id: 'item_4', name: 'Croissant' },
        { id: 'item_7', name: 'Baguette' }
      ]
    })
    const request = (
      completionCreate.mock.calls as unknown as Array<[Record<string, unknown>]>
    )[0]?.[0]

    expect(plan).toMatchObject({
      toolName: 'select_items',
      input: {
        ids: ['item_4', 'item_7']
      }
    })
    expect(planner.status).toBe('ready')
    expect(webLLMMocks.createMLCEngine).toHaveBeenCalledWith(
      'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      expect.objectContaining({
        initProgressCallback: expect.any(Function)
      })
    )
    if (!request) throw new Error('Expected WebLLM request.')
    expect(request.response_format).toEqual({
      type: 'json_object',
      schema: expect.any(String)
    })
    expect(JSON.stringify(request.messages)).toContain('id_from_context_a')
    expect(JSON.stringify(request.messages)).toContain('Do not copy placeholder IDs')
    expect(request.temperature).toBe(0)
  })

  it('grounds bad checklist IDs from the local model against visible context', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      gpu: {
        requestAdapter: async () => ({})
      }
    })
    webLLMMocks.createMLCEngine.mockResolvedValue({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    toolName: 'select_items',
                    input: {
                      ids: ['item_4', 'item_7']
                    },
                    confidence: 0.91,
                    reason: 'Incorrectly copied unrelated item IDs.'
                  })
                }
              }
            ]
          }))
        }
      },
      unload: vi.fn()
    })
    const planner = createBrowserLocalAIPlanner()

    const plan = await planner.plan(
      'Select all the liquids',
      [
        {
          name: 'select_items',
          description: 'Select visible inventory items by stable item IDs.',
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
      ],
      {
        checklistItems: [
          { id: 'item_4', name: 'Croissant' },
          { id: 'item_7', name: 'Baguette' },
          { id: 'item_8', name: 'Water' },
          { id: 'item_10', name: 'Coffee' },
          { id: 'item_14', name: 'Milk' },
          { id: 'item_16', name: 'Sparkling water' },
          { id: 'item_20', name: 'Tea' }
        ]
      }
    )

    expect(plan).toMatchObject({
      toolName: 'select_items',
      input: {
        ids: ['item_8', 'item_10', 'item_14', 'item_16', 'item_20']
      }
    })
    expect(plan.reason).toContain('grounded against visible checklist context')
  })

  it('omits table rows from Browser local AI sort prompts', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      gpu: {
        requestAdapter: async () => ({})
      }
    })
    const completionCreate = vi.fn(async function createCompletion(
      _request: Record<string, unknown>
    ) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                toolName: 'sort_inventory',
                input: {
                  direction: 'asc',
                  sortBy: 'demand'
                },
                confidence: 0.9,
                reason: 'Sorted inventory by demand.'
              })
            }
          }
        ]
      }
    })
    webLLMMocks.createMLCEngine.mockResolvedValue({
      chat: {
        completions: {
          create: completionCreate
        }
      },
      unload: vi.fn()
    })
    const planner = createBrowserLocalAIPlanner()

    await planner.plan(
      'sort by demand',
      [
        {
          name: 'sort_inventory',
          description: 'Sort the visible inventory table by a supported column.',
          inputSchema: {
            type: 'object',
            properties: {
              sortBy: {
                type: 'string',
                enum: ['aisle', 'demand', 'margin', 'name', 'stock', 'supplier']
              },
              direction: {
                type: 'string',
                enum: ['asc', 'desc']
              }
            },
            required: ['sortBy'],
            additionalProperties: false
          },
          execute: () => []
        }
      ],
      {
        checklistItems: [
          { id: 'item_1', name: 'Apple' },
          { id: 'item_68', name: 'Sourdough' }
        ],
        settings: {
          confirmationsEnabled: true,
          density: 'comfortable'
        }
      }
    )

    const request = completionCreate.mock.calls[0]?.[0]
    if (!request) throw new Error('Expected WebLLM request.')
    const promptText = JSON.stringify(request.messages)
    expect(promptText).toContain('\\"checklistItems\\": 2')
    expect(promptText).toContain('Sort tool options:')
    expect(promptText).toContain('\\"sortBy\\": [')
    expect(promptText).toContain('\\"demand\\"')
    expect(promptText).toContain('choose the matching sort tool directly')
    expect(promptText).not.toContain('Sourdough')
    expect(promptText).not.toContain('item_68')
  })

  it('ignores stray sequence steps on a valid single-tool plan', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      gpu: {
        requestAdapter: async () => ({})
      }
    })
    const completionCreate = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              toolName: 'select_items',
              input: {
                ids: ['item_4', 'item_7']
              },
              confidence: 0.91,
              reason: 'Selected French items from current inventory context.',
              steps: [
                {
                  toolName: 'select_items',
                  input: {
                    ids: ['item_4', 'item_7']
                  },
                  confidence: 0.91,
                  reason: 'Selected French items from current inventory context.'
                }
              ]
            })
          }
        }
      ]
    }))
    webLLMMocks.createMLCEngine.mockResolvedValue({
      chat: {
        completions: {
          create: completionCreate
        }
      },
      unload: vi.fn()
    })
    const planner = createBrowserLocalAIPlanner()

    const plan = await planner.plan('Select all French items', [
      {
        name: 'select_items',
        description: 'Select visible inventory items by stable item IDs.',
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

    expect(plan).toEqual({
      toolName: 'select_items',
      input: {
        ids: ['item_4', 'item_7']
      },
      confidence: 0.91,
      reason: 'Selected French items from current inventory context.'
    })
  })

  it('promotes a single executable step when WebLLM leaves top-level input incomplete', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      gpu: {
        requestAdapter: async () => ({})
      }
    })
    webLLMMocks.createMLCEngine.mockResolvedValue({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    toolName: 'select_items',
                    input: {},
                    confidence: 0.91,
                    reason: 'Selected French items from current inventory context.',
                    steps: [
                      {
                        toolName: 'select_items',
                        input: {
                          ids: ['item_4', 'item_7']
                        },
                        confidence: 0.91,
                        reason: 'Selected French items from current inventory context.'
                      }
                    ]
                  })
                }
              }
            ]
          }))
        }
      },
      unload: vi.fn()
    })
    const planner = createBrowserLocalAIPlanner()

    const plan = await planner.plan('Select all French items', [
      {
        name: 'select_items',
        description: 'Select visible inventory items by stable item IDs.',
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

    expect(plan.input).toEqual({
      ids: ['item_4', 'item_7']
    })
  })

  it('falls back to deterministic planning when WebLLM returns an empty sequence', async () => {
    stubWebGPU()
    mockWebLLMContent(getEmptySequenceJson())
    const planner = createBrowserLocalAIPlanner()

    const plan = await planner.plan('create a 100 eu invoice for carlos', [createInvoiceTool()])

    expect(plan).toMatchObject({
      toolName: 'create_invoice',
      input: {
        customerName: 'Carlos',
        amount: 100
      }
    })
    expect(plan.reason).toContain('deterministic demo planning')
  })

  it('does not repair invalid WebLLM output with the generic heuristic fallback', async () => {
    stubWebGPU()
    mockWebLLMContent(getEmptySequenceJson())
    const planner = createBrowserLocalAIPlanner()

    await expect(
      planner.plan('sort invoices by amount', [createSortInvoicesTool()])
    ).rejects.toThrow('provider returned an empty tool sequence')
  })

  it('falls back to deterministic planning when WebLLM returns malformed JSON', async () => {
    stubWebGPU()
    mockWebLLMContent('{"toolName":"create_invoice","input":{"customerName":"Carlos","amount":100}')
    const planner = createBrowserLocalAIPlanner()

    const plan = await planner.plan('create a 100 eu invoice for carlos', [createInvoiceTool()])

    expect(plan).toMatchObject({
      toolName: 'create_invoice',
      input: {
        customerName: 'Carlos',
        amount: 100
      }
    })
    expect(plan.reason).toContain('unparseable output')
  })
})

function stubWebGPU() {
  vi.stubGlobal('navigator', {
    ...navigator,
    gpu: {
      requestAdapter: async () => ({})
    }
  })
}

function mockWebLLMContent(content: string) {
  webLLMMocks.createMLCEngine.mockResolvedValue({
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [
            {
              message: {
                content
              }
            }
          ]
        }))
      }
    },
    unload: vi.fn()
  })
}

function getEmptySequenceJson(): string {
  return JSON.stringify({
    toolName: 'tool_sequence',
    input: {},
    confidence: 0.81,
    reason: 'No valid tool steps found.',
    steps: []
  })
}

function createInvoiceTool() {
  return {
    name: 'create_invoice',
    description: 'Create a draft invoice for a customer and add it to the local invoice list.',
    inputSchema: {
      type: 'object',
      properties: {
        customerName: {
          type: 'string'
        },
        amount: {
          type: 'number',
          minimum: 0.01
        },
        dueDate: {
          type: 'string'
        },
        owner: {
          type: 'string'
        }
      },
      required: ['customerName', 'amount'],
      additionalProperties: false
    },
    execute: () => ({})
  }
}

function createSortInvoicesTool() {
  return {
    name: 'sort_invoices',
    description: 'Sort the visible invoice table by a supported column.',
    inputSchema: {
      type: 'object',
      properties: {
        sortBy: {
          type: 'string',
          enum: ['amount', 'customerName', 'dueDate', 'status']
        },
        direction: {
          type: 'string',
          enum: ['asc', 'desc']
        }
      },
      required: ['sortBy'],
      additionalProperties: false
    },
    execute: () => []
  }
}
