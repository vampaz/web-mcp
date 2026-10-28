import { afterEach, expect, it, vi } from 'vitest'
import { listLmStudioModels } from './lm-studio-models'

afterEach(() => vi.unstubAllGlobals())

it('offers chat models with loaded instance identifiers first and excludes embeddings', async function test() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { type: 'llm', key: 'unloaded', display_name: 'Other', loaded_instances: [] },
            { type: 'embedding', key: 'embed', loaded_instances: [] },
            {
              type: 'llm',
              key: 'gemma',
              display_name: 'Gemma',
              loaded_instances: [{ id: 'gemma-active' }]
            }
          ]
        })
      )
    )
  )
  expect(await listLmStudioModels()).toEqual([
    { model: 'gemma-active', label: 'Gemma', loaded: true },
    { model: 'unloaded', label: 'Other', loaded: false }
  ])
  expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:1234/api/v1/models',
    expect.objectContaining({
      headers: { Accept: 'application/json' },
      credentials: 'omit'
    })
  )
})

it.each([
  { body: {}, status: 200 },
  { body: { models: [] }, status: 503 }
])(
  'reports an unusable model catalog without inventing a model',
  async function test({ body, status }) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
    )
    await expect(listLmStudioModels()).rejects.toThrow()
  }
)

it('identifies a local connection failure without falling back to another provider', async function test() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(listLmStudioModels()).rejects.toThrow('Could not reach LM Studio')
})
