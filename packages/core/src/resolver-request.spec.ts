import { afterEach, expect, it, vi } from 'vitest'
import { createChromeAIResolver, createRemoteResolver } from './resolver'
import { createHostedOpenAIResolver } from './hosted-openai-resolver'
import { validateJsonValue } from './schema'
import type { JsonSchema, WebMCPTool } from './interfaces/tool'

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

it.each(['server', 'hosted', 'chrome'] as const)(
  'restricts %s summary requests and rejects resolver outcomes',
  async function summary(mode) {
    const reply = {
      toolName: 'pi_reply',
      input: { text: 'p-1 saved; p-2 pending.' },
      confidence: 1,
      reason: 'Checkpoint'
    }
    let outcome = reply
    const tool: WebMCPTool = {
      name: 'pi_reply',
      description: 'Return a checkpoint.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false
      },
      execute() {
        throw new Error('Replies must not execute.')
      }
    }
    function checkSchema(schema: JsonSchema) {
      expect(validateJsonValue(reply, schema)).toEqual([])
      for (const toolName of ['needs_clarification', 'no_tools_match', 'tool_sequence'])
        expect(validateJsonValue({ ...reply, toolName }, schema)).not.toEqual([])
    }
    vi.stubGlobal('fetch', async function respond(url: string, options: RequestInit) {
      if (url.endsWith('/session')) return Response.json({ token: 'fixture', tokenType: 'Bearer' })
      const request = JSON.parse(String(options.body))
      expect(request).toMatchObject({ purpose: 'summary', singleStep: true })
      checkSchema(request.responseSchema)
      return Response.json(outcome)
    })
    Reflect.set(window, 'LanguageModel', {
      async availability() {
        return 'available'
      },
      async create(options: { initialPrompts: Array<{ content: string }> }) {
        expect(options.initialPrompts[0].content).not.toContain('Choose one app tool')
        return {
          async clone() {
            return {
              async prompt(message: string, options: { responseConstraint: JsonSchema }) {
                expect(message).not.toContain('Choose the best tool')
                expect(message).not.toContain('needs_clarification')
                checkSchema(options.responseConstraint)
                return JSON.stringify(outcome)
              }
            }
          }
        }
      }
    })
    const resolver =
      mode === 'chrome'
        ? await createChromeAIResolver(true)
        : mode === 'hosted'
          ? createHostedOpenAIResolver({
              accessKey: 'fixture',
              baseUrl: 'https://resolver.test',
              model: 'fixture'
            })
          : createRemoteResolver({
              provider: 'openai',
              auth: { mode: 'server', endpoint: 'https://resolver.test/resolve' }
            })
    await expect(
      resolver.resolve('Summarize the history', [tool], {}, { purpose: 'summary' })
    ).resolves.toEqual(reply)
    for (const toolName of ['needs_clarification', 'no_tools_match']) {
      outcome = { ...reply, toolName }
      await expect(
        resolver.resolve('Summarize the history', [tool], {}, { purpose: 'summary' })
      ).rejects.toThrow('unknown tool')
    }
    resolver.dispose?.()
  }
)
