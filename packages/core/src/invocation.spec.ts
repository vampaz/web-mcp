import { afterEach, expect, it, vi } from 'vitest'

import { setConfirmationHandler } from './confirmation'
import { defineTool } from './define-tool'
import { ToolExecutionError } from './tool-execution-error'
import { subscribeWebMCPKitEvents } from './events'
import type { ConfirmationHandler, WebMCPKitEvent } from './interfaces/tool'
import { clearToolsForTest, invokeTool, registerTool, unregisterTool } from './registry'

afterEach(function cleanup() {
  clearToolsForTest()
  setConfirmationHandler(undefined)
  vi.restoreAllMocks()
})

function setup() {
  let approve!: (value: boolean) => void
  const execute = vi.fn(function execute() {
    return 'executed'
  })
  const tool = defineTool({
    name: 'set_counter',
    description: 'Set the visible counter after the user approves this change.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    confirmation: { reason: 'Change the counter?' },
    execute
  })
  registerTool(tool)
  setConfirmationHandler(function confirm() {
    return new Promise<boolean>(function pending(resolve) {
      approve = resolve
    })
  })
  return {
    tool,
    execute,
    approve(value: boolean) {
      approve(value)
    }
  }
}

it('executes the input shown for approval even if the caller changes it', async function test() {
  let approve!: (value: boolean) => void
  const execute = vi.fn(function execute(input: { amount: number }) {
    return input.amount
  })
  registerTool(
    defineTool({
      name: 'pay_invoice',
      description: 'Pay the approved invoice amount.',
      inputSchema: {
        type: 'object',
        properties: { amount: { type: 'number', maximum: 100 } },
        required: ['amount'],
        additionalProperties: false
      },
      confirmation: { reason: 'Pay this amount?' },
      execute
    })
  )
  const confirm = vi.fn<ConfirmationHandler>(function confirm() {
    return new Promise<boolean>(function pending(resolve) {
      approve = resolve
    })
  })
  setConfirmationHandler(confirm)
  const input = { amount: 10 }
  const pending = invokeTool({ toolName: 'pay_invoice', input })
  input.amount = 1000
  expect(confirm.mock.calls[0]?.[0].input).toEqual({ amount: 10 })
  approve(true)
  expect(await pending).toMatchObject({ status: 'success', output: 10 })
})

it('gives approval and the guard their own copies of the parsed input', async function test() {
  const execute = vi.fn(function execute(input: { tags: string[] }) {
    return input.tags
  })
  registerTool(
    defineTool({
      name: 'tag_note',
      description: 'Tag the selected note with the supplied labels.',
      inputSchema: {
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
        required: ['tags'],
        additionalProperties: false
      },
      parseInput(input) {
        return { tags: [...(input as { tags: string[] }).tags] }
      },
      confirmation: { reason: 'Tag this note?' },
      guard(input) {
        input.tags.push('guard')
        return true
      },
      execute
    })
  )
  setConfirmationHandler(function mutateApprovedInput({ input }) {
    ;(input as { tags: string[] }).tags.push('handler')
    return true
  })

  const result = await invokeTool({ toolName: 'tag_note', input: { tags: ['a'] } })

  expect(result).toMatchObject({ status: 'success', output: ['a'] })
  expect(execute).toHaveBeenCalledWith({ tags: ['a'] }, { source: 'fallback' })
})

it('keeps a parser class instance for approval, guard, and execution', async function test() {
  class ParsedNote {
    constructor(readonly note: string) {}
    label() {
      return this.note.trim()
    }
  }
  const execute = vi.fn(function execute(input: ParsedNote) {
    return input.label()
  })
  registerTool(
    defineTool<ParsedNote, string>({
      name: 'save_note',
      description: 'Save a normalized note in the current workspace.',
      inputSchema: {
        type: 'object',
        properties: { note: { type: 'string' } },
        required: ['note'],
        additionalProperties: false
      },
      parseInput(input) {
        return new ParsedNote((input as { note: string }).note)
      },
      confirmation: { reason: 'Save this note?' },
      guard(input) {
        return input.label().length <= 40
      },
      execute
    })
  )
  let approvedInput: unknown
  setConfirmationHandler(function captureApprovedInput({ input }) {
    approvedInput = input
    return true
  })

  const result = await invokeTool({ toolName: 'save_note', input: { note: '  hi  ' } })

  expect(result).toMatchObject({ status: 'success', output: 'hi' })
  expect(approvedInput).toBeInstanceOf(ParsedNote)
  expect(execute).toHaveBeenCalledWith(expect.any(ParsedNote), { source: 'fallback' })
})

it('copies cyclic parsed input for approval and the guard', async function test() {
  interface CyclicInput {
    value: string
    self?: CyclicInput
  }
  const execute = vi.fn(function execute(input: CyclicInput) {
    return { value: input.value, cyclic: input.self === input }
  })
  registerTool(
    defineTool<CyclicInput, { value: string; cyclic: boolean }>({
      name: 'save_graph',
      description: 'Save a parsed graph in the current workspace.',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false
      },
      parseInput(input) {
        const parsed: CyclicInput = { value: (input as { value: string }).value }
        parsed.self = parsed
        return parsed
      },
      confirmation: { reason: 'Save this graph?' },
      guard(input) {
        input.value = 'guard'
        return true
      },
      execute
    })
  )
  setConfirmationHandler(function mutateApprovedInput({ input }) {
    const parsed = input as CyclicInput
    parsed.value = 'handler'
    expect(parsed.self).toBe(parsed)
    return true
  })

  const result = await invokeTool({ toolName: 'save_graph', input: { value: 'original' } })

  expect(result).toMatchObject({
    status: 'success',
    output: { value: 'original', cyclic: true }
  })
})

it('copies parsed undefined and BigInt fields for approval and the guard', async function test() {
  interface ParsedFields {
    label: string
    note: string | undefined
    count: bigint
  }
  const execute = vi.fn(function execute(input: ParsedFields) {
    return {
      label: input.label,
      count: input.count.toString(),
      hasNote: Object.hasOwn(input, 'note')
    }
  })
  registerTool(
    defineTool<ParsedFields, { label: string; count: string; hasNote: boolean }>({
      name: 'save_fields',
      description: 'Save parsed fields in the current workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      parseInput() {
        return { label: 'original', note: undefined, count: 1n }
      },
      confirmation: { reason: 'Save these fields?' },
      guard(input) {
        input.label = 'guard'
        input.count = 2n
        return true
      },
      execute
    })
  )
  setConfirmationHandler(function mutateApprovedInput({ input }) {
    const parsed = input as ParsedFields
    parsed.label = 'handler'
    parsed.count = 3n
    return true
  })

  const result = await invokeTool({ toolName: 'save_fields', input: {} })

  expect(result).toMatchObject({
    status: 'success',
    output: { label: 'original', count: '1', hasNote: true }
  })
})

it('copies parsed Date and Map values for approval and the guard', async function test() {
  interface ParsedSchedule {
    when: Date
    entries: Map<string, number>
  }
  const execute = vi.fn(function execute(input: ParsedSchedule) {
    return {
      year: input.when.getUTCFullYear(),
      entry: input.entries.get('a')
    }
  })
  registerTool(
    defineTool<ParsedSchedule, { year: number; entry: number | undefined }>({
      name: 'save_schedule',
      description: 'Save a parsed schedule in the current workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      parseInput() {
        return { when: new Date('2026-07-17T00:00:00Z'), entries: new Map([['a', 1]]) }
      },
      confirmation: { reason: 'Save this schedule?' },
      guard(input) {
        input.when.setUTCFullYear(1999)
        input.entries.set('a', 2)
        return true
      },
      execute
    })
  )
  setConfirmationHandler(function mutateApprovedInput({ input }) {
    const parsed = input as ParsedSchedule
    parsed.when.setUTCFullYear(1998)
    parsed.entries.set('a', 3)
    return true
  })

  const result = await invokeTool({ toolName: 'save_schedule', input: {} })

  expect(result).toMatchObject({ status: 'success', output: { year: 2026, entry: 1 } })
})

it('keeps a null-prototype parser output for approval and execution', async function test() {
  const execute = vi.fn(function execute(input: Record<string, unknown>) {
    return {
      value: input.value,
      nullPrototype: Object.getPrototypeOf(input) === null
    }
  })
  registerTool(
    defineTool<Record<string, unknown>, { value: unknown; nullPrototype: boolean }>({
      name: 'save_settings',
      description: 'Save parsed settings in the current workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      parseInput() {
        return Object.assign(Object.create(null) as Record<string, unknown>, { value: 'original' })
      },
      confirmation: { reason: 'Save these settings?' },
      guard(input) {
        return Object.getPrototypeOf(input) === null
      },
      execute
    })
  )
  setConfirmationHandler(function checkApprovedInput({ input }) {
    return Object.getPrototypeOf(input) === null
  })

  const result = await invokeTool({ toolName: 'save_settings', input: {} })

  expect(result).toMatchObject({
    status: 'success',
    output: { value: 'original', nullPrototype: true }
  })
})

it('falls back when a parser getter fails during clone comparison', async function test() {
  let parsed!: { note: string }
  let approvedInput: unknown
  let guardInput: unknown
  let reads = 0
  const execute = vi.fn(function execute(_input: { note: string }) {
    return 'saved'
  })
  registerTool(
    defineTool<{ note: string }, string>({
      name: 'save_note',
      description: 'Save a parsed note in the current workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      parseInput() {
        parsed = Object.defineProperty({}, 'note', {
          enumerable: true,
          get() {
            reads++
            if (reads > 1) throw new Error('Getter was read more than once.')
            return 'original'
          }
        }) as { note: string }
        return parsed
      },
      confirmation: { reason: 'Save this note?' },
      guard(input) {
        guardInput = input
        return true
      },
      execute
    })
  )
  const confirm = vi.fn<ConfirmationHandler>(function confirmApprovedInput({ input }) {
    approvedInput = input
    return true
  })
  setConfirmationHandler(confirm)

  const result = await invokeTool({ toolName: 'save_note', input: {} })

  expect(result).toMatchObject({ status: 'success', output: 'saved' })
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(approvedInput).toBe(parsed)
  expect(guardInput).toBe(parsed)
  expect(execute.mock.calls[0]?.[0]).toBe(parsed)
})

it('cancels a pending approval even when the handler ignores cancellation', async function test() {
  const fixture = setup()
  const controller = new AbortController()
  const pending = invokeTool({ toolName: 'set_counter', input: {}, signal: controller.signal })
  controller.abort()
  expect(await pending).toMatchObject({ status: 'error', code: 'cancelled' })
  fixture.approve(true)
  await Promise.resolve()
  expect(fixture.execute).not.toHaveBeenCalled()
})

it('tags every invocation outcome with an invocationId', async function test() {
  const missing = await invokeTool({ toolName: 'missing_tool', input: {} })
  expect(missing.invocationId).toBeTypeOf('string')

  const fixture = setup()
  const pending = invokeTool({ toolName: 'set_counter', input: {} })
  fixture.approve(true)
  expect(await pending).toMatchObject({ status: 'success', invocationId: expect.any(String) })
})

it('reuses caller-supplied invocation ids for missing tools', async function test() {
  const result = await invokeTool({ id: 'call_1', toolName: 'missing_tool', input: {} })
  expect(result.invocationId).toBe('call_1')
})

it('fails guarded tool calls closed when the guard does not approve', async function test() {
  const execute = vi.fn(function execute() {
    return 'executed'
  })
  registerTool(
    defineTool({
      name: 'set_counter',
      description: 'Set the visible counter after the user approves this change.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      guard(_input) {
        return undefined as unknown as boolean | string
      },
      execute
    })
  )
  const result = await invokeTool({ toolName: 'set_counter', input: {} })
  expect(result).toMatchObject({ status: 'blocked', code: 'guard_blocked' })
  expect(execute).not.toHaveBeenCalled()
})

it('tags confirmation failures with an invocationId', async function test() {
  const fixture = setup()
  setConfirmationHandler(function confirm() {
    throw new Error('handler exploded')
  })
  const result = await invokeTool({ toolName: 'set_counter', input: {} })
  expect(result).toMatchObject({ status: 'error', code: 'confirmation_failed' })
  expect(result.invocationId).toBeTypeOf('string')
  expect(fixture.execute).not.toHaveBeenCalled()
})

it('checks cancellation before asking for approval', async function test() {
  const fixture = setup()
  const confirm = vi.fn()
  setConfirmationHandler(confirm)
  const result = await invokeTool({
    toolName: 'set_counter',
    input: {},
    signal: AbortSignal.abort()
  })
  expect(result.code).toBe('cancelled')
  expect(confirm).not.toHaveBeenCalled()
  expect(fixture.execute).not.toHaveBeenCalled()
})

it.each(['removed', 'replaced', 'schema', 'scope'] as const)(
  'rejects an approval after the tool is %s',
  async function test(change) {
    const fixture = setup()
    const pending = invokeTool({ toolName: 'set_counter', input: {} })
    if (change === 'removed') unregisterTool('set_counter')
    if (change === 'replaced') {
      vi.spyOn(console, 'warn').mockImplementation(function ignore() {})
      unregisterTool('set_counter')
      registerTool({ ...fixture.tool })
    }
    if (change === 'schema') fixture.tool.inputSchema.required = ['new_field']
    if (change === 'scope')
      fixture.tool.scope = function unavailable() {
        return { available: false }
      }
    fixture.approve(true)
    expect((await pending).status).not.toBe('success')
    expect(fixture.execute).not.toHaveBeenCalled()
  }
)

it.each([undefined, null, {}, { available: 'yes' }] as unknown[])(
  'fails a tool closed when scope returns %j',
  async function test(scopeResult) {
    const execute = vi.fn(function execute() {
      return 'executed'
    })
    registerTool(
      defineTool({
        name: 'set_counter',
        description: 'Set the visible counter after the user approves this change.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        scope() {
          return scopeResult as { available: boolean }
        },
        execute
      })
    )

    const result = await invokeTool({ toolName: 'set_counter', input: {} })

    expect(result).toMatchObject({
      status: 'error',
      code: 'scope_failed',
      error: 'Tool scope returned an invalid result.'
    })
    expect(execute).not.toHaveBeenCalled()
  }
)

it('checks scope and cancellation after an asynchronous guard', async function test() {
  const fixture = setup()
  fixture.tool.guard = async function guard() {
    fixture.tool.scope = function unavailable() {
      return { available: false }
    }
    return true
  }
  const pending = invokeTool({ toolName: 'set_counter', input: {} })
  fixture.approve(true)
  expect((await pending).code).toBe('scope_unavailable')
  expect(fixture.execute).not.toHaveBeenCalled()
})

it('emits correlated confirmation events around approval', async () => {
  const fixture = setup()
  const events: WebMCPKitEvent[] = []
  const unsubscribe = subscribeWebMCPKitEvents(function record(event) {
    events.push(event)
  })
  const pending = invokeTool({ id: 'call_1', toolName: 'set_counter', input: {}, source: 'pi' })
  await Promise.resolve()
  expect(events.map((event) => event.type)).toEqual(['invoked', 'confirmation-requested'])
  fixture.approve(true)
  await pending
  unsubscribe()

  expect(events.map((event) => event.type)).toEqual([
    'invoked',
    'confirmation-requested',
    'confirmation-settled',
    'succeeded'
  ])
  expect(events[2]?.detail).toEqual({
    id: 'call_1',
    toolName: 'set_counter',
    source: 'pi',
    approved: true
  })
})

it('gives event subscribers their own copies of input and result', async () => {
  registerTool(
    defineTool({
      name: 'echo_note',
      description: 'Echo a short note back to the caller for display.',
      inputSchema: {
        type: 'object',
        properties: { note: { type: 'string' } },
        required: ['note'],
        additionalProperties: false
      },
      execute(input) {
        return input
      }
    })
  )
  const unsubscribe = subscribeWebMCPKitEvents(function redact(event) {
    const detail = event.detail as Record<string, unknown>
    if (event.type === 'invoked') (detail.input as Record<string, unknown>).note = 'changed'
    if (event.type === 'succeeded') detail.output = '[redacted]'
  })
  const result = await invokeTool({ toolName: 'echo_note', input: { note: 'original' } })
  unsubscribe()

  expect(result.output).toEqual({ note: 'original' })
})

it('keeps validated nested output out of listeners reach', async () => {
  registerTool(
    defineTool({
      name: 'read_counter',
      description: 'Read the current application counter for display.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { counter: { type: 'object', properties: { value: { type: 'integer' } } } },
        required: ['counter']
      },
      execute() {
        return { counter: { value: 7 } }
      }
    })
  )
  const unsubscribe = subscribeWebMCPKitEvents(function tamper(event) {
    if (event.type !== 'succeeded') return
    const output = (event.detail as { output: { counter: { value: unknown } } }).output
    output.counter.value = 'seven'
  })
  const result = await invokeTool({ toolName: 'read_counter', input: {} })
  unsubscribe()

  expect(result).toMatchObject({ status: 'success', output: { counter: { value: 7 } } })
})

it('leaves output that cannot be cloned out of event details', async () => {
  const handle = { close() {} }
  registerTool(
    defineTool({
      name: 'open_editor',
      description: 'Open the inline editor and return its handle to the caller.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute() {
        return handle
      }
    })
  )
  const details: unknown[] = []
  const unsubscribe = subscribeWebMCPKitEvents(function record(event) {
    if (event.type === 'succeeded') details.push(event.detail)
  })
  const result = await invokeTool({ toolName: 'open_editor', input: {} })
  unsubscribe()

  expect(result.output).toBe(handle)
  expect(details[0]).toMatchObject({ status: 'success' })
  expect(details[0]).not.toHaveProperty('output')
})

it('preserves partial application failures without exposing mutable details to listeners', async () => {
  const details = { saved: false, accepted: 2, remaining: 3, reason: 'The third save failed.' }
  registerTool(
    defineTool({
      name: 'accept_proposals',
      description: 'Accept the selected proposals through the application save handler.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute() {
        throw new ToolExecutionError('execution_failed', 'Some proposals were not saved.', details)
      }
    })
  )
  const unsubscribe = subscribeWebMCPKitEvents(function tamper(event) {
    if (event.type === 'failed')
      (event.detail as { details: { accepted: number } }).details.accepted = 99
  })
  const result = await invokeTool({ toolName: 'accept_proposals', input: {} })
  unsubscribe()
  details.accepted = 100
  expect(result).toMatchObject({
    status: 'error',
    code: 'execution_failed',
    details: {
      saved: false,
      accepted: 2,
      remaining: 3,
      reason: 'The third save failed.'
    }
  })
})

it('omits non-JSON error details', async () => {
  registerTool(
    defineTool({
      name: 'read_value',
      description: 'Read the current value through the application handler.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute() {
        throw new ToolExecutionError('execution_failed', 'Failed.', { handle() {} })
      }
    })
  )
  expect(await invokeTool({ toolName: 'read_value', input: {} })).toMatchObject({
    status: 'error',
    error: 'Failed.'
  })
  expect((await invokeTool({ toolName: 'read_value', input: {} })).details).toBeUndefined()
})
