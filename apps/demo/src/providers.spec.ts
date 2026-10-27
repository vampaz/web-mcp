import { afterEach, expect, it, vi } from 'vitest'
import { createDemoProviders } from './providers'

afterEach(function cleanup() {
  vi.unstubAllGlobals()
})

it('offers actual providers and lists chat models with loaded models first', async function choices() {
  const providers = createDemoProviders(false)
  expect(providers.map((provider) => provider.label)).toEqual([
    'LM Studio (local)',
    'Chrome built-in AI'
  ])
  vi.stubGlobal(
    'fetch',
    vi.fn(async function models() {
      return Response.json({
        data: [
          { id: 'alpha', type: 'vlm', state: 'not-loaded' },
          { id: 'bravo', type: 'llm', state: 'loaded' },
          { id: 'embed', type: 'embeddings', state: 'loaded' }
        ]
      })
    })
  )
  expect(await providers[0].loadModels!()).toEqual([
    { model: 'bravo', label: 'bravo' },
    { model: 'alpha', label: 'alpha' }
  ])
  await expect(providers[0].create()).rejects.toThrow('No chat models')
})

it('reports unavailable model discovery and never substitutes test responses', async function unavailable() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async function models() {
      return new Response('', { status: 502 })
    })
  )
  await expect(createDemoProviders(false)[0].loadModels!()).rejects.toThrow(
    'LM Studio is unavailable'
  )
  const testProvider = createDemoProviders(true).find((provider) => provider.id === 'test')!
  expect(testProvider.label).toBe('Test responses (no AI)')
  expect((await testProvider.create()).detail).toContain('No AI model')
})
