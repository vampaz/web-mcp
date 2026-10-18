// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createRemotePlanner, type ToolPlanner } from '@vampaz/webmcp-kit'
import { planPiRound } from './planner-adapter'

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
  const planner = createRemotePlanner({
    provider: 'openai-compatible',
    baseUrl: 'https://planner.test/v1',
    model: 'fixture'
  })
  await expect(
    planPiRound(
      planner,
      [{ role: 'user', content: 'Hello', timestamp: 0 }],
      [],
      {},
      new AbortController().signal,
      2048
    )
  ).rejects.toMatchObject({ code: 'limit_reached' })
  expect(fetch).not.toHaveBeenCalled()
})

it('requires an explicit conversational capability and never uses a fallback planner', async function test() {
  const plan = vi.fn()
  const planner: ToolPlanner = {
    name: 'Anything',
    available: true,
    status: 'ready',
    detail: '',
    plan
  }
  await expect(
    planPiRound(planner, [], [], {}, new AbortController().signal, 4096)
  ).rejects.toMatchObject({ code: 'configuration' })
  expect(plan).not.toHaveBeenCalled()
})
it('limits the actual planner request before dispatch', async function test() {
  const plan = vi.fn()
  const planner: ToolPlanner = {
    name: 'Anything',
    capabilities: { conversation: true },
    available: true,
    status: 'ready',
    detail: '',
    plan
  }
  await expect(
    planPiRound(planner, [], [], { data: 'x'.repeat(4096) }, new AbortController().signal, 1024)
  ).rejects.toMatchObject({ code: 'limit_reached' })
  expect(plan).not.toHaveBeenCalled()
})

it('rejects a speculative sequence even when a custom planner ignores singleStep', async function test() {
  const planner: ToolPlanner = {
    name: 'Custom',
    capabilities: { conversation: true },
    available: true,
    status: 'ready',
    detail: '',
    async plan(_message, _tools, _context, options) {
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
    planPiRound(planner, [], [], {}, new AbortController().signal, 4096)
  ).rejects.toThrow('single-step')
})
