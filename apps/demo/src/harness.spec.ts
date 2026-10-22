import { afterEach, expect, it, vi } from 'vitest'
import { openDemoHarness } from './harness'

afterEach(function cleanup() {
  vi.unstubAllGlobals()
})

it('points to the fixture server when no local model is configured', async function missingModel() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async function config() {
      return Response.json({ modelId: '', fixtures: false })
    })
  )
  await expect(
    openDemoHarness(
      'chat',
      function value() {
        return 0
      },
      function status() {}
    )
  ).rejects.toThrow('npm run dev:demo:fixtures')
})
