import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineTool } from './define-tool'
import {
  clearToolsForTest,
  getTool,
  invokeTool,
  listTools,
  registerTool,
  unregisterTool,
  setConfirmationHandler
} from './index'

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
          required: true,
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

    const confirmed = await invokeTool({
      toolName: 'void_invoice',
      input: { invoiceId: 'inv_1' },
      confirmed: true
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
          required: true,
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
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'void_invoice' }),
      { invoiceId: 'inv_1' },
      'Voiding an invoice cannot be undone in this demo.'
    )
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
          required: true,
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

  it('skips the confirmation handler when an invocation is already confirmed', async () => {
    const confirm = vi.fn(function rejectConfirmation() {
      return false
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
          required: true,
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
      })
    ).resolves.toMatchObject({
      status: 'success',
      output: { invoiceId: 'inv_1' }
    })
    expect(confirm).not.toHaveBeenCalled()
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
          required: true,
          reason: 'Creates a billable invoice.'
        },
        scope,
        guard,
        execute
      })
    )

    const result = await invokeTool({
      toolName: 'create_invoice',
      input: { customerName: 123, amount: 'not-a-number' },
      confirmed: true
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

  it('warns when a duplicate registration replaces an existing tool', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    registerTool(createHygieneTool('select_items'))
    registerTool(createHygieneTool('select_items'))

    expect(listTools()).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Tool "select_items" was already registered')
    )
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
      confirmation: { required: true, reason: 'Selection changes workspace state.' }
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
        required: true,
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
        required: true,
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
