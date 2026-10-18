import { afterEach, expect, it, vi } from 'vitest'
import { createChromeAIPlanner, createRemotePlanner } from './planner'
import { createHostedOpenAIPlanner } from './hosted-openai-planner'

afterEach(function cleanup() {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'LanguageModel')
})

it.each(['json_object', 'json_schema', 'server', 'hosted'] as const)(
  'checks the exact UTF-8 %s request body before dispatch',
  async function test(mode) {
    const reply = { toolName: 'no_tools_match', input: {}, confidence: 0, reason: 'No tools' }
    const fetch = vi.fn(async function respond(url: string, _options?: RequestInit) {
      if (url.endsWith('/session'))
        return Response.json({
          token: 'fixture',
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 600000).toISOString()
        })
      return Response.json(
        mode === 'server' || mode === 'hosted'
          ? reply
          : {
              choices: [{ message: { content: JSON.stringify(reply) } }]
            }
      )
    })
    vi.stubGlobal('fetch', fetch)
    const planner =
      mode === 'hosted'
        ? createHostedOpenAIPlanner({
            accessKey: 'fixture',
            baseUrl: 'https://planner.test',
            model: 'fixture'
          })
        : createRemotePlanner({
            provider: 'openai-compatible',
            baseUrl: 'https://planner.test/v1',
            responseFormat: mode === 'server' ? undefined : mode,
            ...(mode === 'server'
              ? { auth: { mode: 'server' as const, endpoint: 'https://planner.test/plan' } }
              : {})
          })
    await planner.plan('Olá 🌍', [], { selected: '日本語' }, { singleStep: true })
    const body = String(fetch.mock.calls.at(-1)?.[1]?.body)
    const bytes = new TextEncoder().encode(body).byteLength
    expect(bytes).toBeGreaterThan(body.length)
    fetch.mockClear()
    await expect(
      planner.plan(
        'Olá 🌍',
        [],
        { selected: '日本語' },
        { singleStep: true, maxRequestBytes: bytes - 1 }
      )
    ).rejects.toMatchObject({ code: 'limit_reached' })
    expect(fetch).not.toHaveBeenCalled()
    await expect(
      planner.plan(
        'Olá 🌍',
        [],
        { selected: '日本語' },
        { singleStep: true, maxRequestBytes: bytes }
      )
    ).resolves.toEqual(reply)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(body)
  }
)

it('bounds Chrome prompts and response constraints without falling back', async function test() {
  const prompt = vi.fn()
  Reflect.set(window, 'LanguageModel', {
    async availability() {
      return 'available'
    },
    async create() {
      return { prompt }
    }
  })
  const planner = await createChromeAIPlanner()
  await expect(planner.plan('Hello', [], {}, { maxRequestBytes: 20 })).rejects.toMatchObject({
    code: 'limit_reached'
  })
  expect(prompt).not.toHaveBeenCalled()
})
