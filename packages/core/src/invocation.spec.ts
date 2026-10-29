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
