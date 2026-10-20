// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import type { Message } from '@earendil-works/pi-ai'
import { createResolver, type ToolResolver } from '@vampaz/webmcp-kit'
import { resolvePiRound } from './resolver-adapter'

afterEach(function cleanup() {
  vi.unstubAllGlobals()
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
    4096
  )
  expect(resolve.mock.calls[0]?.[2]).toMatchObject({
    piConversation: [
      { role: 'user', content: 'Read invoice inv-7' },
      { role: 'assistant', content: [call] },
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'read_invoice',
        content: result,
        isError: false
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
      2048
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
    resolvePiRound(resolver, [], [], {}, new AbortController().signal, 4096)
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
    resolvePiRound(resolver, [], [], { data: 'x'.repeat(4096) }, new AbortController().signal, 1024)
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
    resolvePiRound(resolver, [], [], {}, new AbortController().signal, 4096)
  ).rejects.toThrow('single-step')
})
