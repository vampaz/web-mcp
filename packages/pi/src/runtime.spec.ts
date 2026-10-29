// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { createModels } from '@earendil-works/pi-ai/models'
import { createRegistry, Harness } from '@earendil-works/pi-durable'
import { createResolver, type ToolResolution, type ToolResolver } from '@vampaz/webmcp-kit'
import { createPiRuntime } from './runtime'
import type { PiController } from './interfaces/controller'
import type { PiToolHost } from './interfaces/host'
import type { PiActionOutcome } from './interfaces/action-outcome'
import { PiFailure } from './errors'
import { installBrowserStorage } from './test-utils/browser'
import * as modelAdapter from './model-adapter'
import * as historyCompaction from './compaction'
import { openPiStorage } from './storage'
import { piSessionKey, resolvePiLimits } from './session'
import { deletePiConversations, listPiConversations } from './conversations'

it('automatically compacts an active turn while retaining its objective, saved actions and full visible history', async function compaction() {
  const summarize = vi.spyOn(historyCompaction, 'summarizePiHistory')
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
        if (checkpoints.length) {
          expect(context.previousCheckpoint).toBe(
            'Category C only. Continue using the exact completed-action record; older target IDs were omitted from this summary.'
          )
          expect(context.previousCheckpoint).not.toContain('<summary>')
        }
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
        const history = message.split('\n\nCurrent user request:')[0]!
        expect(history).not.toContain('p-1')
        return resolution('pi_reply', { text: 'Four category C proposals saved.' })
      }
      return resolution('accept_proposal', { id: `p-${completed.length + 1}` })
    }
  )
  runtime = await createPiRuntime({ ...config, limits: { maxRequestBytes: 32768 } })
  expect(await runtime.send(request)).toEqual({ status: 'completed' })
  expect(checkpoints.length).toBeGreaterThan(1)
  expect(
    summarize.mock.calls.some(function reusedCheckpoint(call) {
      return call[5] !== undefined
    })
  ).toBe(true)
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
        if (message.split('\n\nCurrent user request: ').at(-1)!.startsWith('Earlier evidence'))
          return resolution()
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
          return { resolution: resolution() }
        }, 32_768)
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

it('retains partial-save details after closing and reopening a failed conversation', async () => {
  const details = { accepted: 1, remaining: 4 }
  const config = options([resolution('read_counter', {})], {
    async invoke() {
      return {
        toolName: 'read_counter',
        status: 'error',
        code: 'execution_failed',
        error: 'Partial save.',
        details,
        durationMs: 0
      }
    }
  })
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toMatchObject({ status: 'error' })
  const history = runtime.getSnapshot().messages
  expect(history.find((message) => message.role === 'tool')?.output).toMatchObject({ details })
  await runtime.destroy()
  runtime = await createPiRuntime(config)
  expect(runtime.getSnapshot().messages).toEqual(history)
  expect(config.resolver.resolve).toHaveBeenCalledTimes(1)
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

it('rejects repeated invalid model output without a fallback or tool call', async function test() {
  const config = options([resolution('invented_tool', {}), resolution('invented_tool', {})])
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toMatchObject({
    status: 'error',
    error: { code: 'provider_failed' }
  })
  expect(config.invoke).not.toHaveBeenCalled()
  expect(config.resolver.resolve).toHaveBeenCalledTimes(2)
})

it('gives the model one correction round with the validation error', async function test() {
  const config = options([resolution('invented_tool', {}), resolution()])
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read')).toEqual({ status: 'completed' })
  const retry = vi.mocked(config.resolver.resolve).mock.calls[1]?.[2]
  expect(String(retry?.piCorrection)).toContain('invented_tool')
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

it('corrects a repeated unchanged read before another invocation and stops if ignored', async function test() {
  const config = options(Array.from({ length: 5 }, () => resolution('read_counter', {})))
  const discover = config.host.discover
  config.host.discover = async function readOnly(signal) {
    const catalog = await discover(signal)
    catalog.tools[0]!.annotations = { readOnlyHint: true }
    return catalog
  }
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read the counter')).toMatchObject({
    status: 'error',
    error: { code: 'limit_reached', reason: 'no_progress' }
  })
  expect(config.invoke).toHaveBeenCalledTimes(2)
  expect(vi.mocked(config.resolver.resolve).mock.calls.at(-1)?.[2]?.piCorrection).toContain(
    'unchanged'
  )
})

it('lets the model finish after a repeated-read correction', async function test() {
  const config = options([
    resolution('read_counter', {}),
    resolution('read_counter', {}),
    resolution('read_counter', {}),
    resolution()
  ])
  const discover = config.host.discover
  config.host.discover = async function readOnly(signal) {
    const catalog = await discover(signal)
    catalog.tools[0]!.annotations = { readOnlyHint: true }
    return catalog
  }
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Read the counter')).toEqual({ status: 'completed' })
  expect(config.invoke).toHaveBeenCalledTimes(2)
  expect(vi.mocked(config.resolver.resolve).mock.calls.at(-1)?.[2]?.piCorrection).toContain(
    'unchanged'
  )
})

it('allows repeated reads when their results change', async function test() {
  const config = options([
    ...Array.from({ length: 4 }, () => resolution('read_counter', {})),
    resolution()
  ])
  const discover = config.host.discover
  config.host.discover = async function readOnly(signal) {
    const catalog = await discover(signal)
    catalog.tools[0]!.annotations = { readOnlyHint: true }
    return catalog
  }
  let value = 0
  config.invoke.mockImplementation(async () => ({
    toolName: 'read_counter',
    status: 'success',
    output: { value: ++value },
    durationMs: 0
  }))
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Watch the counter change')).toEqual({ status: 'completed' })
  expect(config.invoke).toHaveBeenCalledTimes(4)
})

it('allows polling while an explicitly pending operation has not completed', async function test() {
  const config = options([
    ...Array.from({ length: 4 }, () => resolution('read_counter', {})),
    resolution()
  ])
  const discover = config.host.discover
  config.host.discover = async function readOnly(signal) {
    const catalog = await discover(signal)
    catalog.tools[0]!.annotations = { readOnlyHint: true }
    return catalog
  }
  config.invoke.mockImplementation(async () => ({
    toolName: 'read_counter',
    status: 'success',
    output: { value: 7, status: 'pending' },
    durationMs: 0
  }))
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Wait for the counter')).toEqual({ status: 'completed' })
  expect(config.invoke).toHaveBeenCalledTimes(4)
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
  expect(runtime.getSnapshot().messages.find((message) => message.role === 'tool')).toMatchObject({
    toolName: 'read_counter',
    status: 'unknown'
  })
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

it('shows what a running turn is doing, including approval waits', async function test() {
  let approve!: () => void
  let waiting!: () => void
  const asked = new Promise<void>(function ready(resolve) {
    waiting = resolve
  })
  const config = options([resolution('read_counter', {}), resolution()], {
    async invoke(call, _signal, progress) {
      progress?.('approval')
      waiting()
      await new Promise<void>(function decide(resolve) {
        approve = resolve
      })
      progress?.('running')
      return { toolName: call.name, status: 'success', output: { value: 7 }, durationMs: 0 }
    }
  })
  runtime = await createPiRuntime(config)
  const turn = runtime.send('Read')
  await asked
  expect(runtime.getSnapshot().activity).toEqual({
    kind: 'tool',
    toolName: 'read_counter',
    phase: 'approval'
  })
  approve()
  expect(await turn).toEqual({ status: 'completed' })
  const snapshot = runtime.getSnapshot()
  expect(snapshot.activity).toBeUndefined()
  expect(snapshot.usage?.historyBytes).toBeGreaterThan(0)
  expect(Object.isFrozen(snapshot.messages)).toBe(true)
  expect(snapshot.messages.find((message) => message.role === 'tool')).toMatchObject({
    toolName: 'read_counter',
    status: 'success',
    output: { value: 7 }
  })
})

it('reports the storage limit hidden inside wrapped failures and flags the unsaved action', async function test() {
  let invoked = 0
  const config = options(
    [resolution(), resolution(), resolution('read_counter', {}), resolution()],
    {
      async invoke(call) {
        invoked++
        return {
          toolName: call.name,
          status: 'success',
          output: { report: 'x'.repeat(30_000) },
          durationMs: 0
        }
      }
    }
  )
  runtime = await createPiRuntime({
    ...config,
    limits: { maxHistoryBytes: 65536, maxRequestBytes: 262144 }
  })
  expect(await runtime.send('a'.repeat(16_000))).toEqual({ status: 'completed' })
  expect(await runtime.send('b'.repeat(16_000))).toEqual({ status: 'completed' })
  const outcome = await runtime.send('Read the report')
  expect(invoked).toBe(1)
  expect(outcome).toMatchObject({
    status: 'error',
    error: { code: 'limit_reached', reason: 'history_bytes', actionMayHaveRun: true }
  })
})

it('enforces the configured message length', async function test() {
  runtime = await createPiRuntime({ ...options([]), limits: { maxMessageChars: 5 } })
  expect(await runtime.send('123456')).toMatchObject({
    status: 'error',
    error: { code: 'configuration', message: 'Enter a message of 1–5 characters.' }
  })
})

it('reloads history after another controller releases a busy conversation', async function test() {
  let release!: () => void
  let started!: () => void
  const running = new Promise<void>(function ready(resolve) {
    started = resolve
  })
  const writer = options([resolution('read_counter', {}), resolution()], {
    async invoke(call) {
      started()
      await new Promise<void>(function hold(resolve) {
        release = resolve
      })
      return { toolName: call.name, status: 'success', output: { value: 7 }, durationMs: 0 }
    }
  })
  runtime = await createPiRuntime(writer)
  const turn = runtime.send('Read')
  await running
  const reader = await createPiRuntime(options([]))
  try {
    expect(reader.getSnapshot()).toMatchObject({
      state: 'error',
      error: { code: 'conversation_busy' }
    })
    release()
    await turn
    await reader.refresh()
    expect(reader.getSnapshot().state).toBe('idle')
    expect(reader.getSnapshot().messages.map((message) => message.role)).toEqual([
      'user',
      'tool',
      'assistant'
    ])
  } finally {
    await reader.destroy()
  }
})

it('deletes stored conversations for one account and clears by deleting the database', async function test() {
  const owner = { namespace: 'tests', ownerId: 'leaving' }
  for (const conversationId of ['one', 'two']) {
    const controller = await createPiRuntime({
      ...options([resolution()]),
      session: { ...owner, conversationId }
    })
    await controller.send('Hello')
    await controller.destroy()
  }
  const other = { namespace: 'tests', ownerId: 'staying', conversationId: 'three' }
  runtime = await createPiRuntime({ ...options([resolution()]), session: other })
  await runtime.send('Hello')
  expect((await listPiConversations(owner)).sort()).toEqual(['one', 'two'])

  await deletePiConversations(owner)

  expect(await listPiConversations(owner)).toEqual([])
  expect(await listPiConversations(other)).toEqual(['three'])
  await runtime.clear()
  expect(await listPiConversations(other)).toEqual([])
})

it('waits for a history reload instead of rejecting a send', async function test() {
  runtime = await createPiRuntime(options([resolution()]))
  const reload = runtime.refresh()
  const outcome = runtime.send('Hello')
  await reload
  expect(await outcome).toEqual({ status: 'completed' })
})

it('reloads every idle reader after a turn finishes in another controller', async function test() {
  runtime = await createPiRuntime(options([resolution()]))
  const readers = [await createPiRuntime(options([])), await createPiRuntime(options([]))]
  try {
    expect(await runtime.send('Hello')).toEqual({ status: 'completed' })
    for (const reader of readers) {
      await vi.waitFor(function reloaded() {
        expect(reader.getSnapshot().messages.map((message) => message.role)).toEqual([
          'user',
          'assistant'
        ])
      })
      expect(reader.getSnapshot().state).toBe('idle')
    }
  } finally {
    for (const reader of readers) await reader.destroy()
  }
})

it('reloads all readers even when one reload outlasts the old retry window', async function test() {
  let hold = false
  let held = false
  let started!: () => void
  let release!: () => void
  const entered = new Promise<void>(function ready(resolve) {
    started = resolve
  })
  const pending = new Promise<void>(function wait(resolve) {
    release = resolve
  })
  const host = options([]).host
  async function discover(signal: AbortSignal) {
    if (hold && !held) {
      held = true
      started()
      await pending
    }
    return host.discover(signal)
  }
  runtime = await createPiRuntime(options([resolution()]))
  const readers = [
    await createPiRuntime(options([], { discover })),
    await createPiRuntime(options([], { discover }))
  ]
  try {
    hold = true
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    expect(await runtime.send('Hello')).toEqual({ status: 'completed' })
    await entered
    await vi.advanceTimersByTimeAsync(5000)
    release()
    vi.useRealTimers()
    for (const reader of readers)
      await vi.waitFor(function reloaded() {
        expect(reader.getSnapshot()).toMatchObject({ state: 'idle', messages: expect.any(Array) })
        expect(reader.getSnapshot().messages).toHaveLength(2)
      })
  } finally {
    release()
    vi.useRealTimers()
    for (const reader of readers) await reader.destroy()
  }
})

it.each(['stop', 'destroy'] as const)(
  'cancels discovery during a reload on %s and releases the conversation',
  async function test(action) {
    let hold = false
    let started!: () => void
    let release!: () => void
    let signal: AbortSignal | undefined
    const entered = new Promise<void>(function ready(resolve) {
      started = resolve
    })
    const pending = new Promise<void>(function wait(resolve) {
      release = resolve
    })
    const host = options([]).host
    runtime = await createPiRuntime(
      options([], {
        async discover(currentSignal) {
          if (hold) {
            signal = currentSignal
            started()
            await pending
          }
          return host.discover(currentSignal)
        }
      })
    )
    hold = true
    const reload = runtime.refresh()
    await entered
    const stopping = runtime[action]()
    try {
      await vi.waitFor(function cancelled() {
        expect(signal?.aborted).toBe(true)
      })
      await stopping
      expect(runtime.getSnapshot().state).toBe(action === 'destroy' ? 'closed' : 'interrupted')
      const replacement = await createPiRuntime(options([]))
      try {
        expect(replacement.getSnapshot().state).toBe('idle')
      } finally {
        await replacement.destroy()
      }
    } finally {
      release()
      await Promise.all([reload, stopping])
    }
  }
)

it('cancels a queued background reload without waiting for the other controller', async function test() {
  const config = options([])
  runtime = await createPiRuntime(config)
  const discover = vi.spyOn(config.host, 'discover')
  let release!: () => void
  let started!: () => void
  const entered = new Promise<void>(function ready(resolve) {
    started = resolve
  })
  const key = piSessionKey(config.session)
  const owner = navigator.locks.request(key, async function hold() {
    started()
    await new Promise<void>(function wait(resolve) {
      release = resolve
    })
  })
  const channel = new BroadcastChannel(key)
  try {
    await entered
    channel.postMessage('changed')
    await vi.waitFor(async function queued() {
      expect((await navigator.locks.query()).pending).toHaveLength(1)
    })
    await runtime.destroy()
    expect((await navigator.locks.query()).held).toHaveLength(1)
    expect(runtime.getSnapshot().state).toBe('closed')
    expect(discover).not.toHaveBeenCalled()
  } finally {
    release()
    await owner
    channel.close()
  }
})

it('empties other controllers on clear without recreating the deleted database', async function test() {
  const config = options([resolution()])
  runtime = await createPiRuntime(config)
  const reader = await createPiRuntime(options([]))
  try {
    expect(await runtime.send('Hello')).toEqual({ status: 'completed' })
    await vi.waitFor(function reloaded() {
      expect(reader.getSnapshot().messages).toHaveLength(2)
    })
    await runtime.clear()
    await vi.waitFor(function emptied() {
      expect(reader.getSnapshot().messages).toEqual([])
    })
    await new Promise(function settle(resolve) {
      setTimeout(resolve, 100)
    })
    expect(await listPiConversations(config.session)).toEqual([])
  } finally {
    await reader.destroy()
  }
})

it('gives malformed model JSON from a built-in resolver one correction round', async function test() {
  const replies = [
    'I would read the counter now.',
    JSON.stringify({
      toolName: 'pi_reply',
      input: { text: 'Done.' },
      confidence: 1,
      reason: 'Reply'
    })
  ]
  const fetch = vi.fn(async function respond() {
    return Response.json({ choices: [{ message: { content: replies.shift() } }] })
  })
  vi.stubGlobal('fetch', fetch)
  const resolver = await createResolver({
    provider: 'openai-compatible',
    baseUrl: 'https://models.example.test/v1',
    auth: { mode: 'none' }
  })
  runtime = await createPiRuntime({ ...options([]), resolver })

  expect(await runtime.send('Hello')).toEqual({ status: 'completed' })
  expect(fetch).toHaveBeenCalledTimes(2)
  const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit]
  const retry = JSON.parse(String(init.body)) as { messages: { content: string }[] }
  expect(retry.messages.at(-1)?.content).toContain('piCorrection')
})

it('does not recreate a cleared database when a controller reloads afterwards', async function test() {
  const config = options([resolution()])
  runtime = await createPiRuntime(config)
  expect(await runtime.send('Hello')).toEqual({ status: 'completed' })
  const reader = await createPiRuntime(options([]))
  try {
    await runtime.clear()
    await reader.refresh()
    expect(reader.getSnapshot()).toMatchObject({ state: 'idle', messages: [] })
    expect(await listPiConversations(config.session)).toEqual([])
  } finally {
    await reader.destroy()
  }
})
