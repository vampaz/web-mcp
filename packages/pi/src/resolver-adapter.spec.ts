// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createRemoteResolver, type ToolResolver } from '@vampaz/webmcp-kit'
import { resolvePiRound } from './resolver-adapter'

afterEach(function cleanup() {
  vi.unstubAllGlobals()
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
  const resolver = createRemoteResolver({
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
