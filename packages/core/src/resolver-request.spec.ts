import { afterEach, expect, it, vi } from 'vitest'
import { createChromeAIResolver, createRemoteResolver } from './resolver'
import { createHostedOpenAIResolver } from './hosted-openai-resolver'

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
              choices: [
                {
                  message: {
                    content: JSON.stringify(mode === 'json_schema' ? { action: reply } : reply)
                  }
                }
              ]
            }
      )
    })
    vi.stubGlobal('fetch', fetch)
    const resolver =
      mode === 'hosted'
        ? createHostedOpenAIResolver({
            accessKey: 'fixture',
            baseUrl: 'https://resolver.test',
            model: 'fixture'
          })
        : createRemoteResolver({
            provider: 'openai-compatible',
            baseUrl: 'https://resolver.test/v1',
            responseFormat: mode === 'server' ? undefined : mode,
            ...(mode === 'server'
              ? { auth: { mode: 'server' as const, endpoint: 'https://resolver.test/resolution' } }
              : {})
          })
    await resolver.resolve('Olá 🌍', [], { selected: '日本語' }, { singleStep: true })
    const body = String(fetch.mock.calls.at(-1)?.[1]?.body)
    const bytes = new TextEncoder().encode(body).byteLength
    expect(bytes).toBeGreaterThan(body.length)
    fetch.mockClear()
    await expect(
      resolver.resolve(
        'Olá 🌍',
        [],
        { selected: '日本語' },
        { singleStep: true, maxRequestBytes: bytes - 1 }
      )
    ).rejects.toMatchObject({ code: 'limit_reached' })
    expect(fetch).not.toHaveBeenCalled()
    await expect(
      resolver.resolve(
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
      return {
        prompt,
        async clone() {
          return { prompt }
        }
      }
    }
  })
  const resolver = await createChromeAIResolver()
  await expect(resolver.resolve('Hello', [], {}, { maxRequestBytes: 20 })).rejects.toMatchObject({
    code: 'limit_reached'
  })
  expect(prompt).not.toHaveBeenCalled()
})
