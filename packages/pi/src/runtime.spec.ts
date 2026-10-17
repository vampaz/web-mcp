// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ToolPlan, ToolPlanner } from '@vampaz/webmcp-kit'
import { createPiRuntime } from './runtime'
import type { PiController } from './interfaces/controller'
import type { PiToolHost } from './interfaces/host'
import { installBrowserStorage } from './test-utils/browser'

let runtime: PiController | undefined
beforeEach(installBrowserStorage)
afterEach(async function cleanup() {
  await runtime?.destroy()
  runtime = undefined
  vi.unstubAllGlobals()
})

function plan(name = 'pi_reply', input: Record<string, unknown> = { text: 'Answered' }): ToolPlan {
  return { toolName: name, input, confidence: 1, reason: 'test' }
}
function options(plans: ToolPlan[], overrides: Partial<PiToolHost> = {}) {
  const invoke = vi.fn(async function invoke() {
    return {
      toolName: 'read_counter',
      status: 'success' as const,
      output: { value: 7 },
      durationMs: 0
    }
  })
  const planner: ToolPlanner = {
    name: 'Fixture',
    available: true,
    capabilities: { conversation: true },
    status: 'ready',
    detail: 'test fixture',
    plan: vi.fn(async function next() {
      const result = plans.shift()
      if (!result) throw new Error('Unexpected planner round')
      return result
    })
  }
  const host: PiToolHost = {
    async discover() {
      return {
        revision: '1',
        tools: [
          {
            name: 'read_counter',
            description: 'Read the current application counter.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false }
          }
        ]
      }
    },
    async context() {
      return { counter: 7 }
    },
    invoke,
    ...overrides
  }
  return {
    session: { namespace: 'tests', ownerId: 'owner', conversationId: 'conversation' },
    planner,
    host,
    invoke
  }
}

it('runs the actual Pi loop and persists an answer across reopening', async function test() {
  const config = options([plan()])
  runtime = await createPiRuntime(config)
  expect(runtime.getSnapshot().state).toBe('idle')
  expect(await runtime.send('Hello')).toEqual({ status: 'completed' })
  expect(runtime.getSnapshot().messages).toEqual(
    expect.arrayContaining([expect.objectContaining({ role: 'assistant', text: 'Answered' })])
  )
  await runtime.destroy()
  runtime = await createPiRuntime(config)
  expect(
    runtime.getSnapshot().messages.some(function answer(message) {
      return message.text === 'Answered'
    })
  ).toBe(true)
  expect(config.planner.plan).toHaveBeenCalledTimes(1)
})

it('feeds the actual tool result back before choosing the next step', async function test() {
  const config = options([plan('read_counter', {}), plan()])
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toEqual({ status: 'completed' })
  expect(config.invoke).toHaveBeenCalledTimes(1)
  expect(config.planner.plan).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(vi.mocked(config.planner.plan).mock.calls[1][2])).toContain('toolResult')
  expect(
    runtime.getSnapshot().messages.some(function result(message) {
      return message.role === 'tool' && message.text.includes('7')
    })
  ).toBe(true)
})

it('refreshes available tools after an action opens a new application context', async function test() {
  let editorOpen = false
  let saved = false
  const invoked: string[] = []
  const config = options([plan('open_editor', {}), plan('save_document', {}), plan()], {
    async discover() {
      return {
        revision: editorOpen ? 'editor' : 'home',
        tools: [
          {
            name: editorOpen ? 'save_document' : 'open_editor',
            description: editorOpen ? 'Save the open document.' : 'Open the document editor.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false }
          }
        ]
      }
    },
    async invoke(call) {
      invoked.push(call.name)
      expect(call.revision).toBe(editorOpen ? 'editor' : 'home')
      if (call.name === 'open_editor') editorOpen = true
      else saved = true
      return {
        toolName: call.name,
        status: 'success',
        output: { editorOpen, saved },
        durationMs: 0
      }
    }
  })
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Open the editor and save the document')).toEqual({
    status: 'completed'
  })
  expect(invoked).toEqual(['open_editor', 'save_document'])
  expect(saved).toBe(true)
  const secondRound = vi.mocked(config.planner.plan).mock.calls[1][1]
  expect(
    secondRound.map(function name(tool) {
      return tool.name
    })
  ).toEqual(['save_document', 'pi_reply'])
})

it('ends a denied action without another model round', async function test() {
  const config = options([plan('read_counter', {})], {
    async invoke() {
      return {
        toolName: 'read_counter',
        status: 'blocked',
        code: 'confirmation_denied',
        error: 'Denied',
        durationMs: 0
      }
    }
  })
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toMatchObject({
    status: 'error',
    error: { code: 'action_denied' }
  })
  expect(config.planner.plan).toHaveBeenCalledTimes(1)
})

it('rejects a catalog change while the planner is choosing an action', async function test() {
  const config = options([])
  let revision = 'initial'
  const discover = config.host.discover
  config.host.discover = async function current(signal) {
    return { ...(await discover(signal)), revision }
  }
  config.planner.plan = vi.fn(async function changeDuringPlanning() {
    revision = 'changed'
    return plan('read_counter', {})
  })
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toMatchObject({
    status: 'error',
    error: { code: 'stale_document' }
  })
  expect(config.invoke).not.toHaveBeenCalled()
  expect(config.planner.plan).toHaveBeenCalledTimes(1)
})

it('preserves a completed action result when refreshing tools fails', async function test() {
  const config = options([plan('read_counter', {})])
  const discover = config.host.discover
  config.host.discover = async function failAfterAction(signal) {
    if (config.invoke.mock.calls.length) throw new Error('The new context is unavailable.')
    return discover(signal)
  }
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toMatchObject({
    status: 'error',
    error: { message: 'The new context is unavailable.' }
  })
  expect(config.invoke).toHaveBeenCalledTimes(1)
  expect(runtime.getSnapshot().messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'tool',
        failed: false,
        text: expect.stringContaining('"value":7')
      })
    ])
  )
  expect(config.planner.plan).toHaveBeenCalledTimes(1)
})

it('rejects invalid model output without a fallback or tool call', async function test() {
  const config = options([plan('invented_tool', {})])
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toMatchObject({
    status: 'error',
    error: { code: 'provider_failed' }
  })
  expect(config.invoke).not.toHaveBeenCalled()
})

it('enforces the configured tool call limit', async function test() {
  const config = options([plan('read_counter', {}), plan('read_counter', {})])
  runtime = await createPiRuntime({ ...config, limits: { maxToolCalls: 1 } })
  expect(await runtime.send('Read repeatedly')).toMatchObject({
    status: 'error',
    error: { code: 'limit_reached' }
  })
  expect(config.invoke).toHaveBeenCalledTimes(1)
})

it('stops an uncooperative provider and settles the turn', async function test() {
  const config = options([])
  let requested!: () => void
  const started = new Promise<void>(function ready(resolve) {
    requested = resolve
  })
  config.planner.plan = function pending() {
    requested()
    return new Promise(function never() {})
  }
  runtime = await createPiRuntime(config)
  const turn = runtime.send('Wait')
  await started
  await runtime.stop()
  expect(await turn).toEqual({ status: 'interrupted' })
  expect(runtime.getSnapshot().state).toBe('interrupted')
  expect(config.invoke).not.toHaveBeenCalled()
})

it('rejects simultaneous sends and clear during an active turn', async function test() {
  const config = options([])
  let requested!: () => void
  const started = new Promise<void>(function ready(resolve) {
    requested = resolve
  })
  config.planner.plan = function pending() {
    requested()
    return new Promise(function never() {})
  }
  runtime = await createPiRuntime(config)
  const turn = runtime.send('Wait')
  await started
  expect(await runtime.send('Second')).toMatchObject({ error: { code: 'conversation_busy' } })
  await expect(runtime.clear()).rejects.toThrow('Stop')
  await runtime.stop()
  await turn
  await runtime.clear()
  expect(runtime.getSnapshot().messages).toEqual([])
})

it.each(['send', 'clear', 'stop'] as const)(
  'admits the turn before a synchronous subscriber can %s',
  async function test(action) {
    const config = options([plan()])
    runtime = await createPiRuntime(config)
    let handled = false
    let operation: Promise<unknown> | undefined
    runtime.subscribe(function react(snapshot) {
      if (snapshot.state !== 'running' || handled) return
      handled = true
      if (action === 'send') operation = runtime!.send('Second request')
      else if (action === 'stop') operation = runtime!.stop()
      else
        operation = runtime!.clear().catch(function rejected(error) {
          return error
        })
    })
    const outcome = await runtime.send('Hello')
    const result = await operation
    if (action === 'stop') {
      expect(outcome.status).toBe('interrupted')
      expect(config.planner.plan).not.toHaveBeenCalled()
    } else {
      expect(result).toMatchObject(
        action === 'send'
          ? { status: 'error', error: { code: 'conversation_busy' } }
          : { code: 'conversation_busy' }
      )
      expect(outcome.status).toBe('completed')
      expect(config.planner.plan).toHaveBeenCalledTimes(1)
    }
  }
)

it('keeps separate owners and rejects a changed catalog before invocation', async function test() {
  const config = options([plan('read_counter', {})])
  let revision = 0
  const discover = config.host.discover
  config.host.discover = async function change(signal) {
    return { ...(await discover(signal)), revision: String(++revision) }
  }
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toMatchObject({
    status: 'error',
    error: { code: 'stale_document' }
  })
  expect(config.invoke).not.toHaveBeenCalled()
  await runtime.destroy()
  runtime = await createPiRuntime({
    ...options([plan()]),
    session: { ...config.session, ownerId: 'someone-else' }
  })
  expect(runtime.getSnapshot().messages).toEqual([])
})

it('settles a pending clear before destruction closes the controller', async function test() {
  const config = options([plan()])
  runtime = await createPiRuntime(config)
  await runtime.send('Hello')
  const clearing = runtime.clear()
  const closing = runtime.destroy()
  await Promise.all([clearing, closing])
  expect(runtime.getSnapshot().state).toBe('closed')
})

it('stops visibly at the durable history limit and still permits Clear chat', async function test() {
  runtime = await createPiRuntime({
    ...options([plan(), plan(), plan()]),
    limits: { maxHistoryBytes: 65536, maxRequestBytes: 65536 }
  })
  let failure: Awaited<ReturnType<PiController['send']>> | undefined
  for (let index = 0; index < 3; index++) {
    const outcome = await runtime.send('x'.repeat(16000))
    if (outcome.status === 'error') {
      failure = outcome
      break
    }
  }
  expect(failure?.status).toBe('error')
  expect(failure?.error?.message).toContain('Clear chat')
  expect(runtime.getSnapshot().state).toBe('error')
  await runtime.clear()
  expect(runtime.getSnapshot().messages).toEqual([])
})

it('keeps an already executed effect when its acknowledgement is interrupted and never replays it', async function test() {
  let effects = 0
  let executed!: () => void
  const started = new Promise<void>(function ready(resolve) {
    executed = resolve
  })
  const config = options([plan('read_counter', {}), plan()], {
    async invoke() {
      effects++
      executed()
      return new Promise(function lostAcknowledgement() {})
    }
  })
  runtime = await createPiRuntime(config)
  const turn = runtime.send('Act')
  await started
  await runtime.stop()
  expect(await turn).toEqual({ status: 'interrupted' })
  expect(effects).toBe(1)
  await runtime.destroy()
  runtime = await createPiRuntime(config)
  expect(runtime.getSnapshot().state).toBe('interrupted')
  await runtime.destroy()
  runtime = await createPiRuntime(config)
  expect(runtime.getSnapshot().state).toBe('interrupted')
  expect(effects).toBe(1)
  expect(config.planner.plan).toHaveBeenCalledTimes(1)
  expect(await runtime.send('Explain what happened')).toEqual({ status: 'completed' })
  expect(runtime.getSnapshot().state).toBe('idle')
  expect(effects).toBe(1)
  await runtime.destroy()
  runtime = await createPiRuntime(config)
  expect(runtime.getSnapshot().state).toBe('idle')
})
