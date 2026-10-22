import { clearToolsForTest } from './registry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineTool } from './define-tool'
import {
  getTool,
  invokeTool,
  listTools,
  registerTool,
  registerTools,
  unregisterTool,
  setConfirmationHandler
} from './index'
import type { ToolInvocation } from './interfaces/tool'

describe('registry', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
  })

  afterEach(() => {
    setConfirmationHandler(undefined)
  })

  it('registers and invokes a fallback tool', async () => {
    registerTool(
      defineTool({
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
      })
    )

    expect(listTools()).toHaveLength(1)

    const result = await invokeTool({
      toolName: 'create_invoice',
      input: { amount: 42 }
    })

    expect(result.status).toBe('success')
    expect(result.output).toEqual({ id: 'inv_1', amount: 42 })
  })

  it('blocks sensitive tools until confirmed', async () => {
    setConfirmationHandler(function rejectConfirmation() {
      return false
    })

    registerTool(
      defineTool({
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
          reason: 'Voiding an invoice cannot be undone in this demo.'
        },
        execute() {
          return { voided: true }
        }
      })
    )

    const blocked = await invokeTool({
      toolName: 'void_invoice',
      input: { invoiceId: 'inv_1' }
    })

    expect(blocked.status).toBe('blocked')

    setConfirmationHandler(function approveConfirmation() {
      return true
    })
    const confirmed = await invokeTool({
      toolName: 'void_invoice',
      input: { invoiceId: 'inv_1' }
    })

    expect(confirmed.status).toBe('success')
  })

  it('uses a configured confirmation handler for sensitive tools', async () => {
    const confirm = vi.fn(function confirmInvocation() {
      return true
    })
    setConfirmationHandler(confirm)

    registerTool(
      defineTool({
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
          reason: 'Voiding an invoice cannot be undone in this demo.'
        },
        execute() {
          return { voided: true }
        }
      })
    )

    const result = await invokeTool({
      toolName: 'void_invoice',
      input: { invoiceId: 'inv_1' }
    })

    expect(result.status).toBe('success')
    expect(confirm).toHaveBeenCalledWith({
      tool: expect.objectContaining({ name: 'void_invoice' }),
      input: { invoiceId: 'inv_1' },
      reason: 'Voiding an invoice cannot be undone in this demo.'
    })
  })

  it('returns an error when the confirmation handler fails', async () => {
    const execute = vi.fn(function voidInvoice() {
      return { voided: true }
    })
    setConfirmationHandler(async function failConfirmation() {
      throw new Error('modal crashed')
    })

    registerTool(
      defineTool({
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
          reason: 'Voiding an invoice cannot be undone in this demo.'
        },
        execute
      })
    )

    await expect(
      invokeTool({
        toolName: 'void_invoice',
        input: { invoiceId: 'inv_1' }
      })
    ).resolves.toMatchObject({
      status: 'error',
      error: 'Confirmation handler failed: modal crashed'
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('ignores caller-provided confirmation and approves only an explicit true', async () => {
    const confirm = vi.fn(function returnDialogValue() {
      return 'cancel' as unknown as boolean
    })
    setConfirmationHandler(confirm)

    registerTool(
      defineTool({
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
          reason: 'Voiding an invoice cannot be undone in this demo.'
        },
        execute(input) {
          return input
        }
      })
    )

    await expect(
      invokeTool({
        toolName: 'void_invoice',
        input: { invoiceId: 'inv_1' },
        confirmed: true
      } as ToolInvocation)
    ).resolves.toMatchObject({
      status: 'blocked',
      code: 'confirmation_denied'
    })
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('rejects input that is not plain JSON with a result instead of throwing', async () => {
    const execute = vi.fn(function readStatus() {
      return { ok: true }
    })
    registerTool(
      defineTool({
        name: 'read_status',
        description: 'Read the current status for one filter value.',
        inputSchema: {
          type: 'object',
          properties: { status: { enum: ['open', 'closed'] } },
          additionalProperties: false
        },
        execute
      })
    )
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    for (const input of [{ status: 10n }, cyclic, { status: new Date() }, { status: Number.NaN }]) {
      await expect(
        invokeTool({ toolName: 'read_status', input: input as Record<string, unknown> })
      ).resolves.toMatchObject({ status: 'error', code: 'invalid_input' })
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('keeps a JSON __proto__ key as an own property that validation rejects', async () => {
    const execute = vi.fn(function readAmount(input: Record<string, unknown>) {
      return { amount: input.amount }
    })
    registerTool(
      defineTool<Record<string, unknown>>({
        name: 'read_amount',
        description: 'Read the requested amount back to the caller for display.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute
      })
    )

    const result = await invokeTool({
      toolName: 'read_amount',
      input: JSON.parse('{"__proto__":{"amount":5}}') as Record<string, unknown>
    })

    expect(result).toMatchObject({ status: 'error', code: 'invalid_input' })
    expect(result.error).toContain('__proto__ is not allowed')
    expect(execute).not.toHaveBeenCalled()
  })

  it('reports output that cannot be validated as invalid output', async () => {
    registerTool(
      defineTool({
        name: 'read_total',
        description: 'Read the current invoice total for the open workspace.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        outputSchema: { type: 'object', properties: { total: { enum: [1] } } },
        execute() {
          return { total: 10n }
        }
      })
    )

    await expect(invokeTool({ toolName: 'read_total', input: {} })).resolves.toMatchObject({
      status: 'error',
      code: 'invalid_output'
    })
  })

  it('registers a set of tools atomically with one disposer', () => {
    function tool(name: string) {
      return defineTool({
        name,
        description: `Read the ${name.replace('_', ' ')} for the current workspace.`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute() {
          return {}
        }
      })
    }
    registerTool(tool('read_taken'))

    expect(function duplicate() {
      registerTools([tool('read_first'), tool('read_taken')])
    }).toThrow('already registered')
    expect(getTool('read_first')).toBeUndefined()

    const set = registerTools([tool('read_first'), tool('read_second')])
    expect(set.registrations.map((registration) => registration.tool.name)).toEqual([
      'read_first',
      'read_second'
    ])
    set.unregister()
    expect(getTool('read_first')).toBeUndefined()
    expect(getTool('read_second')).toBeUndefined()
    expect(getTool('read_taken')).toBeDefined()
  })

  it('returns an error before handlers run when input validation fails', async () => {
    const confirm = vi.fn(function confirmInvocation() {
      return true
    })
    const scope = vi.fn(function getAvailability() {
      return { available: true }
    })
    const guard = vi.fn(function allowInvocation() {
      return true
    })
    const execute = vi.fn(function createInvoice() {
      return { id: 'inv_1' }
    })
    setConfirmationHandler(confirm)

    registerTool(
      defineTool({
        name: 'create_invoice',
        description: 'Create an invoice for a customer and open it in the current workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            customerName: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 }
          },
          required: ['customerName', 'amount'],
          additionalProperties: false
        },
        confirmation: {
          reason: 'Creates a billable invoice.'
        },
        scope,
        guard,
        execute
      })
    )

    const result = await invokeTool({
      toolName: 'create_invoice',
      input: { customerName: 123, amount: 'not-a-number' }
    })

    expect(result.status).toBe('error')
    expect(result.error).toBe(
      'input validation failed: /customerName expected string, got integer. /amount expected number, got string.'
    )
    expect(scope).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(guard).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns an error when scope or guard throws', async () => {
    registerTool(
      defineTool({
        name: 'open_invoice',
        description: 'Open an invoice row in the visible invoice detail drawer.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          },
          required: ['id']
        },
        scope() {
          throw new Error('workspace state missing')
        },
        execute(input) {
          return input
        }
      })
    )

    await expect(
      invokeTool({
        toolName: 'open_invoice',
        input: { id: 'inv_1' }
      })
    ).resolves.toMatchObject({
      status: 'error',
      error: 'workspace state missing'
    })
  })
})

describe('registry hygiene', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
  })

  afterEach(() => {
    setConfirmationHandler(undefined)
    vi.restoreAllMocks()
  })

  it('unregisters a tool by name', () => {
    registerTool(createHygieneTool('select_items'))

    expect(unregisterTool('select_items')).toBe(true)
    expect(listTools()).toHaveLength(0)
    expect(unregisterTool('select_items')).toBe(false)
  })

  it('rejects a duplicate name without replacing the registered tool', function duplicate() {
    const first = registerTool(createHygieneTool('select_items'))
    expect(function registerDuplicate() {
      registerTool(createHygieneTool('select_items'))
    }).toThrow('already registered')
    expect(listTools()).toEqual([first])
  })
})

describe('invocation result codes', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
  })

  afterEach(() => {
    setConfirmationHandler(undefined)
  })

  it('reports not_registered for unknown tools', async () => {
    const result = await invokeTool({ toolName: 'missing_tool', input: {} })

    expect(result.status).toBe('error')
    expect(result.code).toBe('not_registered')
  })

  it('reports invalid_input for schema violations', async () => {
    registerTool(createHygieneTool('select_items'))

    const result = await invokeTool({ toolName: 'select_items', input: { ids: 'oops' } })

    expect(result.status).toBe('error')
    expect(result.code).toBe('invalid_input')
  })

  it('reports guard_blocked when a guard rejects', async () => {
    registerTool({
      ...createHygieneTool('select_items'),
      guard() {
        return 'Items are not visible.'
      }
    })

    const result = await invokeTool({ toolName: 'select_items', input: { ids: [] } })

    expect(result.status).toBe('blocked')
    expect(result.code).toBe('guard_blocked')
  })

  it('reports scope_unavailable when a tool is out of scope', async () => {
    registerTool({
      ...createHygieneTool('select_items'),
      scope() {
        return { available: false, reason: 'Not on this page.' }
      }
    })

    const result = await invokeTool({ toolName: 'select_items', input: { ids: [] } })

    expect(result.status).toBe('unavailable')
    expect(result.code).toBe('scope_unavailable')
  })

  it('reports confirmation_denied when the handler denies', async () => {
    setConfirmationHandler(() => false)
    registerTool({
      ...createHygieneTool('select_items'),
      confirmation: { reason: 'Selection changes workspace state.' }
    })

    const result = await invokeTool({ toolName: 'select_items', input: { ids: [] } })

    expect(result.status).toBe('blocked')
    expect(result.code).toBe('confirmation_denied')
  })

  it('reports execution_failed when execute throws', async () => {
    registerTool({
      ...createHygieneTool('select_items'),
      execute() {
        throw new Error('workspace state missing')
      }
    })

    const result = await invokeTool({ toolName: 'select_items', input: { ids: [] } })

    expect(result.status).toBe('error')
    expect(result.code).toBe('execution_failed')
  })

  it('reports invalid_output when execute violates the output schema', async () => {
    registerTool(
      defineTool<{ ids: string[] }, number[]>({
        ...createHygieneTool('select_items'),
        outputSchema: {
          type: 'array',
          items: { type: 'string' }
        },
        execute() {
          return [42]
        }
      })
    )

    const result = await invokeTool({ toolName: 'select_items', input: { ids: [] } })

    expect(result).toMatchObject({
      status: 'error',
      code: 'invalid_output',
      error: 'output validation failed: /0 expected string, got integer.'
    })
  })
})

describe('per-tool confirmation handlers', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
  })

  afterEach(() => {
    setConfirmationHandler(undefined)
  })

  it('prefers the tool confirmation handler over the global handler', async () => {
    const globalHandler = vi.fn(() => true)
    const toolHandler = vi.fn(() => true)
    setConfirmationHandler(globalHandler)
    registerTool({
      ...createHygieneTool('select_items'),
      confirmation: {
        reason: 'Selection changes workspace state.',
        handler: toolHandler
      }
    })

    const result = await invokeTool({ toolName: 'select_items', input: { ids: [] } })

    expect(result.status).toBe('success')
    expect(toolHandler).toHaveBeenCalledTimes(1)
    expect(globalHandler).not.toHaveBeenCalled()
  })

  it('blocks with confirmation_denied when the tool handler denies', async () => {
    registerTool({
      ...createHygieneTool('select_items'),
      confirmation: {
        reason: 'Selection changes workspace state.',
        handler: () => false
      }
    })

    const result = await invokeTool({ toolName: 'select_items', input: { ids: [] } })

    expect(result.status).toBe('blocked')
    expect(result.code).toBe('confirmation_denied')
  })
})

function createHygieneTool(name: string) {
  return defineTool({
    name,
    description: 'Select checklist items by stable ID.',
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
    execute(input) {
      return input.ids
    }
  })
}

describe('stale unregister handles', () => {
  beforeEach(() => {
    clearToolsForTest()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignores stale handles after a name is re-registered', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = registerTool(createHygieneTool('select_items'))
    first.unregister()
    const second = registerTool(createHygieneTool('select_items'))

    first.unregister()

    expect(listTools()).toHaveLength(1)
    expect(getTool('select_items')).toBe(second)
  })

  it('keeps unregister idempotent', () => {
    const registration = registerTool(createHygieneTool('select_items'))

    registration.unregister()
    registration.unregister()

    expect(listTools()).toHaveLength(0)
  })
})
