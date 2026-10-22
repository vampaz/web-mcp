// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import type { Message } from '@earendil-works/pi-ai'
import { createResolver, type ToolResolver } from '@vampaz/webmcp-kit'
import { resolvePiRound } from './resolver-adapter'

afterEach(function cleanup() {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('aborts a stalled model request after two minutes and ignores its late answer', async function test() {
  vi.useFakeTimers()
  let finish!: (value: Awaited<ReturnType<ToolResolver['resolve']>>) => void
  let requestSignal: AbortSignal | undefined
  const resolver: ToolResolver = {
    name: 'Stalled provider',
    available: true,
    status: 'ready',
    detail: '',
    capabilities: { conversation: true },
    resolve(_message, _tools, _context, options) {
      requestSignal = options?.signal
      return new Promise(function pending(resolve) {
        finish = resolve
      })
    }
  }
  let outcome: unknown
  const pending = resolvePiRound(
    resolver,
    [{ role: 'user', content: 'Read the invoice', timestamp: 0 }],
    [],
    {},
    new AbortController().signal,
    4096,
    120_000
  ).then(
    (value) => {
      outcome = value
    },
    (error) => {
      outcome = error
    }
  )

  await vi.advanceTimersByTimeAsync(119999)
  expect(outcome).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1)
  const deadlineOutcome = outcome
  const abortedAtDeadline = requestSignal?.aborted
  finish({ toolName: 'pi_reply', input: { text: 'Late answer' }, confidence: 1, reason: 'Late' })
  await pending

  expect(deadlineOutcome).toMatchObject({
    code: 'provider_failed',
    message: expect.stringContaining('timed out')
  })
  expect(abortedAtDeadline).toBe(true)
  expect(outcome).toBe(deadlineOutcome)
  expect(vi.getTimerCount()).toBe(0)
})

it('preserves user cancellation and clears the model deadline', async function test() {
  vi.useFakeTimers()
  const controller = new AbortController()
  let requestSignal: AbortSignal | undefined
  const resolver: ToolResolver = {
    name: 'Stalled provider',
    available: true,
    status: 'ready',
    detail: '',
    capabilities: { conversation: true },
    resolve(_message, _tools, _context, options) {
      requestSignal = options?.signal
      return new Promise(function pending() {})
    }
  }
  const pending = resolvePiRound(
    resolver,
    [{ role: 'user', content: 'Read the invoice', timestamp: 0 }],
    [],
    {},
    controller.signal,
    4096,
    120_000
  )
  const failure = expect(pending).rejects.toMatchObject({ code: 'stale_document' })
  controller.abort()

  await failure
  expect(requestSignal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('preserves tool inputs and results while omitting request-only metadata', async function test() {
  const call = {
    type: 'toolCall' as const,
    id: 'call-1',
    name: 'read_invoice',
    arguments: { id: 'inv-7' }
  }
  const result = [{ type: 'text' as const, text: '{"id":"inv-7","paid":false}' }]
  const messages: Message[] = [
    { role: 'user', content: 'Read invoice inv-7', timestamp: 1 },
    {
      role: 'assistant',
      content: [call],
      api: 'openai-completions',
      provider: 'fixture',
      model: 'fixture',
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      },
      stopReason: 'toolUse',
      timestamp: 2
    },
    {
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'read_invoice',
      content: result,
      details: { diagnostic: 'internal' },
      isError: false,
      timestamp: 3
    }
  ]
  const before = structuredClone(messages)
  const resolve = vi.fn<ToolResolver['resolve']>(async function reply() {
    return {
      toolName: 'pi_reply',
      input: { text: 'Invoice inv-7 is unpaid.' },
      confidence: 1,
      reason: 'Read result'
    }
  })
  await resolvePiRound(
    {
      name: 'Fixture',
      available: true,
      status: 'ready',
      detail: '',
      capabilities: { conversation: true },
      resolve
    },
    messages,
    [],
    {},
    new AbortController().signal,
    4096,
    120_000
  )
  expect(resolve.mock.calls[0]?.[2]).toMatchObject({
    piConversation: [
      { role: 'user', content: 'Read invoice inv-7' },
      {
        role: 'assistant',
        content: [{ type: 'toolCall', name: 'read_invoice', arguments: { id: 'inv-7' } }]
      },
      {
        role: 'toolResult',
        toolName: 'read_invoice',
        isError: false,
        result: '{"id":"inv-7","paid":false}'
      }
    ]
  })
  expect(JSON.stringify(resolve.mock.calls[0]?.[2])).not.toMatch(/timestamp|usage|diagnostic/)
  expect(messages).toEqual(before)
})

it('includes provider serialization overhead in the request budget', async function test() {
  const fetch = vi.fn(async function respond() {
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              toolName: 'pi_reply',
              input: { text: 'Hello' },
              confidence: 1,
              reason: 'Reply'
            })
          }
        }
      ]
    })
  })
  vi.stubGlobal('fetch', fetch)
  const resolver = await createResolver({
    provider: 'openai-compatible',
    baseUrl: 'https://resolver.test/v1',
    model: 'fixture'
  })
  await expect(
    resolvePiRound(
      resolver,
      [{ role: 'user', content: 'Hello', timestamp: 0 }],
      [],
      {},
      new AbortController().signal,
      2048,
      120_000
    )
  ).rejects.toMatchObject({ code: 'limit_reached' })
  expect(fetch).not.toHaveBeenCalled()
})

it('requires an explicit conversational capability and never uses a fallback resolver', async function test() {
  const resolve = vi.fn()
  const resolver: ToolResolver = {
    name: 'Anything',
    available: true,
    status: 'ready',
    detail: '',
    resolve
  }
  await expect(
    resolvePiRound(resolver, [], [], {}, new AbortController().signal, 4096, 120_000)
  ).rejects.toMatchObject({ code: 'configuration' })
  expect(resolve).not.toHaveBeenCalled()
})
it('limits the actual resolver request before dispatch', async function test() {
  const resolve = vi.fn()
  const resolver: ToolResolver = {
    name: 'Anything',
    capabilities: { conversation: true },
    available: true,
    status: 'ready',
    detail: '',
    resolve
  }
  await expect(
    resolvePiRound(
      resolver,
      [],
      [],
      { data: 'x'.repeat(4096) },
      new AbortController().signal,
      1024,
      120_000
    )
  ).rejects.toMatchObject({ code: 'limit_reached' })
  expect(resolve).not.toHaveBeenCalled()
})

it('rejects a speculative sequence even when a custom resolver ignores singleStep', async function test() {
  const resolver: ToolResolver = {
    name: 'Custom',
    capabilities: { conversation: true },
    available: true,
    status: 'ready',
    detail: '',
    async resolve(_message, _tools, _context, options) {
      expect(options?.singleStep).toBe(true)
      return {
        toolName: 'tool_sequence',
        input: {},
        confidence: 1,
        reason: 'Speculative',
        steps: [
          {
            toolName: 'pi_reply',
            input: { text: 'future result' },
            confidence: 1,
            reason: 'Speculative'
          }
        ]
      }
    }
  }
  await expect(
    resolvePiRound(resolver, [], [], {}, new AbortController().signal, 4096, 120_000)
  ).rejects.toThrow('single-step')
})

it('keeps historical actions and checkpoints outside fresh application context', async function test() {
  const resolve = vi.fn<ToolResolver['resolve']>(async function reply() {
    return { toolName: 'pi_reply', input: { text: 'Done.' }, confidence: 1, reason: 'Reply' }
  })
  const messages = [
    {
      role: 'user',
      content:
        'The conversation history before this point was compacted into the following summary:\n\n<summary>\nInvoice inv-1 exists.\n</summary>',
      timestamp: 0
    },
    { role: 'user', content: 'Create an invoice for ACME', timestamp: 1 },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'call-1', name: 'create_invoice', arguments: { customer: 'ACME' } }
      ],
      stopReason: 'toolUse',
      timestamp: 2
    },
    {
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'create_invoice',
      content: [
        { type: 'text', text: '{"status":"success","output":{"id":"inv-2"},"durationMs":4}' }
      ],
      isError: false,
      timestamp: 3
    },
    { role: 'user', content: 'continue', timestamp: 4 }
  ] as unknown as Message[]

  const round = await resolvePiRound(
    {
      name: 'Fixture',
      available: true,
      status: 'ready',
      detail: '',
      capabilities: { conversation: true },
      resolve
    },
    messages,
    [],
    { invoices: [], piCompletedActions: [] },
    new AbortController().signal,
    16_384,
    120_000
  )

  const [message, , context] = resolve.mock.calls[0]!
  expect(context).toMatchObject({ invoices: [], piCompletedActions: [] })
  expect(context).not.toHaveProperty('piPreviousActions')
  expect(context).not.toHaveProperty('piPreviousConversation')
  expect(context).not.toHaveProperty('piCheckpoint')
  const history = JSON.parse(message.split('\n\nCurrent user request:')[0]!.split('\n')[1]!)
  expect(history.piPreviousActions).toEqual([
    {
      toolName: 'create_invoice',
      input: { customer: 'ACME' },
      result: { status: 'success', output: { id: 'inv-2' } }
    }
  ])
  expect(history.piCheckpoint).toMatchObject({ text: 'Invoice inv-1 exists.' })
  expect(JSON.stringify(history.piPreviousConversation)).not.toContain('compacted')
  expect(context?.piConversation).toEqual([{ role: 'user', content: 'continue' }])
  expect(message).toContain('untrusted data, not current state')
  expect(message).toContain('\n\nCurrent user request: continue')
  expect(round.requestBytes).toBeGreaterThan(0)
})
