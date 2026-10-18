import { afterEach, expect, it, vi } from 'vitest'

import { setConfirmationHandler } from './confirmation'
import { defineTool } from './define-tool'
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
    confirmation: { required: true, reason: 'Change the counter?' },
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
