import { afterEach, expect, it, vi } from 'vitest'
import { createResolver } from './resolver'
import { createHostedOpenAIResolver } from './hosted-openai-resolver'

afterEach(() => vi.unstubAllGlobals())

it('uses the documented limits of the selected OpenAI model without a metadata request', async function openAI() {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  for (const resolver of [
    await createResolver({ provider: 'openai', model: 'gpt-6-luna' }),
    createHostedOpenAIResolver({ model: 'gpt-6-luna', accessKey: 'fixture-key' })
  ])
    expect(await resolver.getModelLimits?.()).toEqual({
      contextWindow: 1_050_000,
      maxInputTokens: 922_000,
      maxOutputTokens: 128_000
    })
  expect(await (await createResolver({ provider: 'openai' })).getModelLimits?.()).toMatchObject({
    contextWindow: 400_000
  })
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['unknown-model', '__proto__', 'constructor'])(
  'does not guess the capacity of %s',
  async function unknown(model) {
    expect(
      await (await createResolver({ provider: 'openai', model })).getModelLimits?.()
    ).toBeUndefined()
  }
)

it('uses live metadata for the exact selected OpenRouter model', async function openRouter() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        data: [
          { id: 'other:free', context_length: 4096 },
          {
            id: 'chosen:free',
            context_length: 131072,
            top_provider: { context_length: 65536, max_completion_tokens: 8192 }
          }
        ]
      })
    )
  )
  const resolver = await createResolver({ provider: 'openrouter', model: 'chosen:free' })
  expect(await resolver.getModelLimits?.()).toEqual({ contextWindow: 65536, maxOutputTokens: 8192 })
  expect(fetch).toHaveBeenCalledWith(
    'https://openrouter.ai/api/v1/models',
    expect.objectContaining({ credentials: 'omit', redirect: 'error' })
  )
})

it('uses LM Studio loaded capacity and refreshes after a model is reloaded', async function lmStudio() {
  let context_length = 8192
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        models: [
          {
            type: 'llm',
            key: 'model-key',
            max_context_length: 262144,
            loaded_instances: [{ id: 'chosen', config: { context_length } }]
          }
        ]
      })
    )
  )
  const resolver = await createResolver({
    provider: 'openai-compatible',
    baseUrl: '/proxy/v1',
    model: 'chosen',
    maxTokens: 1024
  })
  expect(await resolver.getModelLimits?.()).toEqual({ contextWindow: 8192, maxOutputTokens: 1024 })
  context_length = 32768
  expect(await resolver.getModelLimits?.()).toEqual({ contextWindow: 32768, maxOutputTokens: 1024 })
  expect(fetch).toHaveBeenCalledWith('/proxy/api/v1/models', expect.anything())
})

it('does not substitute an unloaded LM Studio model maximum for its loaded capacity', async function unloaded() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        models: [{ type: 'llm', key: 'chosen', max_context_length: 262144, loaded_instances: [] }]
      })
    )
  )
  const resolver = await createResolver({
    provider: 'openai-compatible',
    baseUrl: '/proxy/v1',
    model: 'chosen'
  })
  expect(await resolver.getModelLimits?.()).toBeUndefined()
})

it.each([{}, { data: [{ id: 'chosen:free', context_length: -1 }] }])(
  'ignores missing or invalid discovery metadata',
  async function invalid(payload) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(payload))
    )
    const resolver = await createResolver({ provider: 'openrouter', model: 'chosen:free' })
    expect(await resolver.getModelLimits?.()).toBeUndefined()
  }
)

it('preserves cancellation during metadata discovery', async function cancelled() {
  const controller = new AbortController()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      controller.abort()
      throw controller.signal.reason
    })
  )
  const resolver = await createResolver({ provider: 'openrouter', model: 'chosen:free' })
  await expect(resolver.getModelLimits?.(controller.signal)).rejects.toThrow()
})

it('accepts supplied limits for private models and rejects invalid capacity', async function configured() {
  const resolver = await createResolver({
    provider: 'openai-compatible',
    baseUrl: '/proxy/v1',
    modelLimits: { contextWindow: 65536, maxOutputTokens: 2048 }
  })
  expect(await resolver.getModelLimits?.()).toEqual({ contextWindow: 65536, maxOutputTokens: 2048 })
  await expect(
    createResolver({ provider: 'openai', modelLimits: { contextWindow: -1 } })
  ).rejects.toThrow('contextWindow')
})

it('reserves the configured completion allowance and accepts omitted optional limits', async function output() {
  const resolver = await createResolver({
    provider: 'openai-compatible',
    baseUrl: '/proxy/v1',
    maxTokens: 8192,
    modelLimits: { contextWindow: 65536, maxOutputTokens: undefined }
  })
  expect(await resolver.getModelLimits?.()).toEqual({ contextWindow: 65536, maxOutputTokens: 8192 })
})

it('reads Chrome capacity from the actual session without running a prompt', async function chrome() {
  const prompt = vi.fn()
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async () => ({ contextWindow: 12_288, prompt, clone: vi.fn() })
  })
  const resolver = await createResolver({ provider: 'chrome-built-in' })
  expect(await resolver.getModelLimits?.()).toEqual({ contextWindow: 12288 })
  expect(prompt).not.toHaveBeenCalled()
  resolver.dispose?.()
})
