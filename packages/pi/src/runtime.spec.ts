// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { createModels } from '@earendil-works/pi-ai/models'
import { createRegistry, Harness } from '@earendil-works/pi-durable'
import type { ToolResolution, ToolResolver } from '@vampaz/webmcp-kit'
import { createPiRuntime } from './runtime'
import type { PiController } from './interfaces/controller'
import type { PiToolHost } from './interfaces/host'
import type { PiActionOutcome } from './interfaces/action-outcome'
import { PiFailure } from './errors'
import { installBrowserStorage } from './test-utils/browser'
import * as modelAdapter from './model-adapter'
import { openPiStorage } from './storage'
import { piSessionKey, resolvePiLimits } from './session'

it('automatically compacts an active turn while retaining its objective, saved actions and full visible history', async function compaction() {
  const applied: string[] = []
  const checkpoints: string[] = []
  const request = 'Accept all proposals in category C; never change another category.'
  const config = options([], {
    async discover() {
      return {
        revision: '1',
        tools: [
          {
            name: 'accept_proposal',
            description: 'Accept the specified pending proposal.',
            inputSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
              additionalProperties: false
            }
          }
        ]
      }
    },
    async invoke(call) {
      const id = String(call.input.id)
      expect(applied).not.toContain(id)
      applied.push(id)
      call.input.id = 'host-normalized-input'
      return {
        toolName: call.name,
        status: 'success',
        output: { id, saved: true, evidence: 'supporting calculation '.repeat(500) },
        durationMs: 0
      }
    }
  })
  config.resolver.resolve = vi.fn<ToolResolver['resolve']>(
    async function next(message, tools, context) {
      if (typeof context?.transcript === 'string') {
        expect(
          tools.map(function name(tool) {
            return tool.name
          })
        ).toEqual(['pi_reply'])
        expect(context.transcript).not.toContain('older target IDs were omitted from this summary')
        if (checkpoints.length) expect(context.previousCheckpoint).toContain('Category C only')
        checkpoints.push(context.transcript)
        return resolution('pi_reply', {
          text: 'Category C only. Continue using the exact completed-action record; older target IDs were omitted from this summary.'
        })
      }
      expect(message).toContain(request)
      const completed = context?.piCompletedActions as PiActionOutcome[]
      expect(completed.map((action) => action.input.id)).toEqual(applied)
      expect(completed.every((action) => action.status === 'success')).toBe(true)
      if (completed.length === 4) {
        expect(JSON.stringify(context?.piPreviousConversation)).not.toContain('p-1')
        return resolution('pi_reply', { text: 'Four category C proposals saved.' })
      }
      return resolution('accept_proposal', { id: `p-${completed.length + 1}` })
    }
  )
  runtime = await createPiRuntime({ ...config, limits: { maxRequestBytes: 32768 } })
  expect(await runtime.send(request)).toEqual({ status: 'completed' })
  expect(checkpoints.length).toBeGreaterThan(0)
  expect(applied).toEqual(['p-1', 'p-2', 'p-3', 'p-4'])
  const history = runtime.getSnapshot().messages
  expect(history[0]).toMatchObject({ role: 'user', text: request })
  expect(
    history.filter(function tool(message) {
      return message.role === 'tool'
    })
  ).toHaveLength(4)
  expect(
    history.some(function internal(message) {
      return message.text.includes('<summary>')
    })
  ).toBe(false)
  const calls = vi.mocked(config.resolver.resolve).mock.calls.length
  await runtime.destroy()
  runtime = await createPiRuntime({ ...config, limits: { maxRequestBytes: 32768 } })
  expect(runtime.getSnapshot().messages).toEqual(history)
  expect(vi.mocked(config.resolver.resolve).mock.calls).toHaveLength(calls)
  expect(applied).toHaveLength(4)
})

it('Stop interrupts compaction without placing a late checkpoint or replaying the saved action', async function cancelCompaction() {
  let started!: () => void
  const summarizing = new Promise<void>(function pending(resolve) {
    started = resolve
  })
  let finish!: (value: ToolResolution) => void
  const invoke = vi.fn(async function saved() {
    return {
      toolName: 'read_counter',
      status: 'success' as const,
      output: { saved: true, evidence: 'evidence '.repeat(1800) },
      durationMs: 0
    }
  })
  const config = options([], { invoke })
  config.resolver.resolve = vi.fn<ToolResolver['resolve']>(
    async function next(_message, _tools, context) {
      if (typeof context?.transcript === 'string') {
        started()
        return new Promise<ToolResolution>(function pending(resolve) {
          finish = resolve
        })
      }
      return resolution('read_counter', {})
    }
  )
  runtime = await createPiRuntime({ ...config, limits: { maxRequestBytes: 32768 } })
  const turn = runtime.send('Save once and continue')
  await summarizing
  await runtime.stop()
  finish(resolution('pi_reply', { text: 'Late checkpoint' }))
  expect(await turn).toEqual({ status: 'interrupted' })
  expect(invoke).toHaveBeenCalledOnce()
  const history = runtime.getSnapshot().messages
  expect(
    history.some(function late(message) {
      return message.text.includes('Late checkpoint')
    })
  ).toBe(false)
  await runtime.destroy()
  runtime = await createPiRuntime(config)
  expect(runtime.getSnapshot().state).toBe('interrupted')
  expect(invoke).toHaveBeenCalledOnce()
})

it('reports a failed compaction without continuing application actions or losing saved history', async function failedCompaction() {
  const invoke = vi.fn(async function saved() {
    return {
      toolName: 'read_counter',
      status: 'success' as const,
      output: { saved: true, evidence: 'evidence '.repeat(1800) },
      durationMs: 0
    }
  })
  const config = options([], { invoke })
  config.resolver.resolve = vi.fn<ToolResolver['resolve']>(
    async function next(_message, _tools, context) {
      if (typeof context?.transcript === 'string') throw new Error('Local model is unavailable')
      return resolution('read_counter', {})
    }
  )
  runtime = await createPiRuntime({ ...config, limits: { maxRequestBytes: 32768 } })
  expect(await runtime.send('Save once and continue')).toMatchObject({
    status: 'error',
    error: { message: 'Local model is unavailable' }
  })
  expect(invoke).toHaveBeenCalledOnce()
  expect(runtime.getSnapshot().messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'tool',
        failed: false,
        text: expect.stringContaining('"saved":true')
      })
    ])
  )
  await runtime.destroy()
  runtime = await createPiRuntime(config)
  expect(invoke).toHaveBeenCalledOnce()
})

it.each(['provider context', 'serialized request budget'])(
  'recovers a %s overflow by compaction without repeating a saved action',
  async function overflowCompaction(kind) {
    let overflow = false
    const checkpoints: string[] = []
    const config = options([])
    config.resolver.resolve = vi.fn<ToolResolver['resolve']>(
      async function next(message, _tools, context) {
        if (typeof context?.transcript === 'string') {
          checkpoints.push(context.transcript)
          return resolution('pi_reply', {
            text: 'Earlier evidence noted. Continue the current request.'
          })
        }
        if (message.startsWith('Earlier evidence')) return resolution()
        if (!config.invoke.mock.calls.length) return resolution('read_counter', {})
        if (!overflow) {
          overflow = true
          if (kind === 'provider context')
            throw new Error('prompt is too long: provider context limit exceeded')
          throw new PiFailure(
            'limit_reached',
            'This conversation exceeds the resolver request limit.'
          )
        }
        return resolution('pi_reply', { text: 'The saved counter result is 7.' })
      }
    )
    runtime = await createPiRuntime(config)
    expect(await runtime.send('Earlier evidence A: ' + 'first evidence '.repeat(200))).toEqual({
      status: 'completed'
    })
    expect(await runtime.send('Earlier evidence B: ' + 'second evidence '.repeat(600))).toEqual({
      status: 'completed'
    })
    expect(await runtime.send('Read the counter once and report its saved result.')).toEqual({
      status: 'completed'
    })
    expect(checkpoints.length).toBeGreaterThan(0)
    expect(config.invoke).toHaveBeenCalledOnce()
    expect(runtime.getSnapshot().state).toBe('idle')
    const history = runtime.getSnapshot().messages
    expect(history.filter((message) => message.failed)).toEqual([])
    await runtime.destroy()
    runtime = await createPiRuntime(config)
    expect(runtime.getSnapshot().messages).toEqual(history)
    expect(config.invoke).toHaveBeenCalledOnce()
  }
)

it('keeps a small request budget usable without making extra summarization requests', async function smallBudget() {
  const config = options([resolution(), resolution()])
  runtime = await createPiRuntime({ ...config, limits: { maxRequestBytes: 4096 } })
  expect(await runtime.send('Earlier evidence A: ' + 'a'.repeat(400))).toEqual({
    status: 'completed'
  })
  expect(await runtime.send('Earlier evidence B: ' + 'b'.repeat(400))).toEqual({
    status: 'completed'
  })
  expect(config.resolver.resolve).toHaveBeenCalledTimes(2)
})

let runtime: PiController | undefined
beforeEach(installBrowserStorage)
afterEach(async function cleanup() {
  await runtime?.destroy()
  runtime = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function resolution(
  name = 'pi_reply',
  input: Record<string, unknown> = { text: 'Answered' }
): ToolResolution {
  return { toolName: name, input, confidence: 1, reason: 'test' }
}
function options(resolutions: ToolResolution[], overrides: Partial<PiToolHost> = {}) {
  const invoke = vi.fn(async function invoke() {
    return {
      toolName: 'read_counter',
      status: 'success' as const,
      output: { value: 7 },
      durationMs: 0
    }
  })
  const resolver: ToolResolver = {
    name: 'Fixture',
    available: true,
    capabilities: { conversation: true },
    status: 'ready',
    detail: 'test fixture',
    resolve: vi.fn(async function next() {
      const result = resolutions.shift()
      if (!result) throw new Error('Unexpected resolver round')
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
    resolver,
    host,
    invoke
  }
}

it('runs the actual Pi loop and persists an answer across reopening', async function test() {
  const config = options([resolution()])
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
  expect(config.resolver.resolve).toHaveBeenCalledTimes(1)
})

it.each([false, true])(
  'upgrades a saved model without losing history or replaying actions (interrupted: %s)',
  async function upgrade(interrupted) {
    const config = options([resolution('read_counter', {}), resolution(), resolution()])
    runtime = await createPiRuntime(config)
    expect(await runtime.send('Read before upgrading')).toEqual({ status: 'completed' })
    const history = runtime.getSnapshot().messages
    await runtime.destroy()

    const storage = await openPiStorage(
      piSessionKey(config.session),
      resolvePiLimits().maxHistoryBytes
    )
    const legacy = await Harness.open(
      storage,
      {
        registry: createRegistry(),
        models: modelAdapter.createPiModels(async function unused() {
          return resolution()
        })
      },
      BACKGROUND_CONTEXT
    )
    try {
      const conversation = await legacy.root(BACKGROUND_CONTEXT)
      await conversation.configure(
        { model: { provider: 'webmcp', modelId: 'configured-planner' } },
        BACKGROUND_CONTEXT
      )
      if (interrupted)
        await conversation.submit(
          { type: 'write', entry: { kind: 'webmcp.turn.started' } },
          BACKGROUND_CONTEXT
        )
    } finally {
      await legacy.close(BACKGROUND_CONTEXT)
    }

    runtime = await createPiRuntime(config)
    expect(runtime.getSnapshot()).toMatchObject({
      state: interrupted ? 'interrupted' : 'idle',
      messages: history
    })
    expect(config.resolver.resolve).toHaveBeenCalledTimes(2)
    expect(config.invoke).toHaveBeenCalledTimes(1)
    expect(await runtime.send('Continue after upgrading')).toEqual({ status: 'completed' })
    expect(config.resolver.resolve).toHaveBeenCalledTimes(3)
    expect(config.invoke).toHaveBeenCalledTimes(1)
    const continued = runtime.getSnapshot().messages
    expect(continued.slice(0, history.length)).toEqual(history)
    expect(continued.at(-1)).toMatchObject({ role: 'assistant', text: 'Answered' })

    await runtime.destroy()
    runtime = await createPiRuntime(config)
    expect(runtime.getSnapshot()).toMatchObject({ state: 'idle', messages: continued })
    expect(config.resolver.resolve).toHaveBeenCalledTimes(3)
    expect(config.invoke).toHaveBeenCalledTimes(1)
  }
)

it('reports an unanswered Pi submission instead of claiming completion', async function unanswered() {
  vi.spyOn(modelAdapter, 'createPiModels').mockReturnValue(createModels())
  const config = options([resolution()])
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Hello')).toMatchObject({
    status: 'error',
    error: { code: 'provider_failed', message: expect.stringContaining('no_model') }
  })
  expect(runtime.getSnapshot()).toMatchObject({ state: 'error' })
  expect(config.resolver.resolve).not.toHaveBeenCalled()
  expect(config.invoke).not.toHaveBeenCalled()
})

it('feeds the actual tool result back before choosing the next step', async function test() {
  const config = options([resolution('read_counter', {}), resolution()])
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toEqual({ status: 'completed' })
  expect(config.invoke).toHaveBeenCalledTimes(1)
  expect(config.resolver.resolve).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(vi.mocked(config.resolver.resolve).mock.calls[1][2])).toContain(
    'toolResult'
  )
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
  const config = options(
    [resolution('open_editor', {}), resolution('save_document', {}), resolution()],
    {
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
    }
  )
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Open the editor and save the document')).toEqual({
    status: 'completed'
  })
  expect(invoked).toEqual(['open_editor', 'save_document'])
  expect(saved).toBe(true)
  const secondRound = vi.mocked(config.resolver.resolve).mock.calls[1][1]
  expect(
    secondRound.map(function name(tool) {
      return tool.name
    })
  ).toEqual(['save_document', 'pi_reply'])
})

it('refreshes tools that finish mounting between the action result and the next model round', async function test() {
  let editorReady = false
  let saved = false
  const invoked: string[] = []
  const config = options(
    [resolution('open_editor', {}), resolution('save_document', {}), resolution()],
    {
      async discover() {
        return {
          revision: editorReady ? 'editor' : 'home',
          tools: [
            {
              name: editorReady ? 'save_document' : 'open_editor',
              description: editorReady ? 'Save the open document.' : 'Open the document editor.',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false }
            }
          ]
        }
      },
      async invoke(call) {
        invoked.push(call.name)
        expect(call.revision).toBe(editorReady ? 'editor' : 'home')
        if (call.name === 'save_document') saved = true
        return { toolName: call.name, status: 'success', output: { saved }, durationMs: 0 }
      }
    }
  )
  runtime = await createPiRuntime(config)
  const unsubscribe = runtime.subscribe(function finishMounting(snapshot) {
    if (snapshot.messages.some((message) => message.toolName === 'open_editor')) editorReady = true
  })
  try {
    expect(await runtime.send('Open the editor and save the document')).toEqual({
      status: 'completed'
    })
    expect(invoked).toEqual(['open_editor', 'save_document'])
    expect(saved).toBe(true)
    expect(vi.mocked(config.resolver.resolve).mock.calls[1][1].map((tool) => tool.name)).toEqual([
      'save_document',
      'pi_reply'
    ])
    expect(config.resolver.resolve).toHaveBeenCalledTimes(3)
    const history = runtime.getSnapshot().messages
    expect(
      history.filter((message) => message.role === 'tool').map((message) => message.toolName)
    ).toEqual(['open_editor', 'save_document'])
    await runtime.destroy()
    runtime = await createPiRuntime(config)
    expect(runtime.getSnapshot().messages).toEqual(history)
    expect(invoked).toEqual(['open_editor', 'save_document'])
    expect(config.resolver.resolve).toHaveBeenCalledTimes(3)
  } finally {
    unsubscribe()
  }
})

it('ends a denied action without another model round', async function test() {
  const config = options([resolution('read_counter', {})], {
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
  expect(config.resolver.resolve).toHaveBeenCalledTimes(1)
})

it('discards a stale choice and resolves again when tools change during inference', async function test() {
  const config = options([])
  let revision = 'initial'
  const discover = config.host.discover
  config.host.discover = async function current(signal) {
    return { ...(await discover(signal)), revision }
  }
  config.resolver.resolve = vi.fn(async function changeDuringResolving() {
    if (revision === 'initial') {
      revision = 'changed'
      return resolution('read_counter', {})
    }
    return resolution('pi_reply', { text: 'The application changed. No action was performed.' })
  })
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toEqual({ status: 'completed' })
  expect(config.invoke).not.toHaveBeenCalled()
  expect(config.resolver.resolve).toHaveBeenCalledTimes(2)
  expect(runtime.getSnapshot().messages.at(-1)?.text).toBe(
    'The application changed. No action was performed.'
  )
})

it('preserves a completed action result when refreshing tools fails', async function test() {
  const config = options([resolution('read_counter', {})])
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
  expect(config.resolver.resolve).toHaveBeenCalledTimes(1)
})

it('rejects invalid model output without a fallback or tool call', async function test() {
  const config = options([resolution('invented_tool', {})])
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toMatchObject({
    status: 'error',
    error: { code: 'provider_failed' }
  })
  expect(config.invoke).not.toHaveBeenCalled()
})

it('enforces the configured tool call limit', async function test() {
  const config = options([resolution('read_counter', {}), resolution('read_counter', {})])
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
  config.resolver.resolve = function pending() {
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

it('releases the conversation after a model timeout without replaying a late action', async function test() {
  const config = options([resolution()])
  let requested!: () => void
  let lateAnswer!: (value: ToolResolution) => void
  const started = new Promise<void>(function ready(resolve) {
    requested = resolve
  })
  vi.mocked(config.resolver.resolve).mockImplementationOnce(function stalled() {
    requested()
    return new Promise(function pending(resolve) {
      lateAnswer = resolve
    })
  })
  runtime = await createPiRuntime(config)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const turn = runtime.send('Read the counter')
  await started
  await vi.advanceTimersByTimeAsync(120000)

  expect(await turn).toMatchObject({
    status: 'error',
    error: { code: 'provider_failed', message: expect.stringContaining('timed out') }
  })
  lateAnswer(resolution('read_counter', {}))
  await expect(runtime.send('Hello again')).resolves.toEqual({ status: 'completed' })
  expect(config.invoke).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('rejects simultaneous sends and clear during an active turn', async function test() {
  const config = options([])
  let requested!: () => void
  const started = new Promise<void>(function ready(resolve) {
    requested = resolve
  })
  config.resolver.resolve = function pending() {
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
    const config = options([resolution()])
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
      expect(config.resolver.resolve).not.toHaveBeenCalled()
    } else {
      expect(result).toMatchObject(
        action === 'send'
          ? { status: 'error', error: { code: 'conversation_busy' } }
          : { code: 'conversation_busy' }
      )
      expect(outcome.status).toBe('completed')
      expect(config.resolver.resolve).toHaveBeenCalledTimes(1)
    }
  }
)

it('keeps separate owners and rejects a changed catalog before invocation', async function test() {
  const config = options([resolution('read_counter', {})])
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
    ...options([resolution()]),
    session: { ...config.session, ownerId: 'someone-else' }
  })
  expect(runtime.getSnapshot().messages).toEqual([])
})

it('settles a pending clear before destruction closes the controller', async function test() {
  const config = options([resolution()])
  runtime = await createPiRuntime(config)
  await runtime.send('Hello')
  const clearing = runtime.clear()
  const closing = runtime.destroy()
  await Promise.all([clearing, closing])
  expect(runtime.getSnapshot().state).toBe('closed')
})

it('stops visibly at the durable history limit and still permits starting a new chat', async function test() {
  runtime = await createPiRuntime({
    ...options(
      Array.from({ length: 5 }, function reply() {
        return resolution()
      })
    ),
    limits: { maxHistoryBytes: 65536, maxRequestBytes: 262144 }
  })
  let failure: Awaited<ReturnType<PiController['send']>> | undefined
  for (let index = 0; index < 5; index++) {
    const outcome = await runtime.send('x'.repeat(16000))
    if (outcome.status === 'error') {
      failure = outcome
      break
    }
  }
  expect(failure?.status).toBe('error')
  expect(failure?.error?.message).toContain('Start a new chat')
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
  const config = options([resolution('read_counter', {}), resolution()], {
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
  expect(config.resolver.resolve).toHaveBeenCalledTimes(1)
  expect(await runtime.send('Explain what happened')).toEqual({ status: 'completed' })
  expect(runtime.getSnapshot().state).toBe('idle')
  expect(effects).toBe(1)
  await runtime.destroy()
  runtime = await createPiRuntime(config)
  expect(runtime.getSnapshot().state).toBe('idle')
})
