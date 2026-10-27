import { expect, it, vi } from 'vitest'
import { createPiHarness } from '@vampaz/webmcp-kit/pi'
import { openDemoHarness } from './harness'
import { createFixtureResolver } from './fixtures/resolver'

vi.mock('@vampaz/webmcp-kit/pi', function harness() {
  return {
    createPiHarness: vi.fn(async function create() {
      return {}
    })
  }
})

it('uses the selected resolver and separates real conversations from test responses', async function sessions() {
  const resolver = createFixtureResolver()
  await openDemoHarness('chat', () => 3, resolver)
  expect(createPiHarness).toHaveBeenLastCalledWith(
    expect.objectContaining({
      resolver,
      session: {
        namespace: 'webmcp-kit-live-lab',
        ownerId: 'local-developer',
        conversationId: 'chat'
      }
    })
  )
  await openDemoHarness('chat', () => 3, resolver, true)
  expect(createPiHarness).toHaveBeenLastCalledWith(
    expect.objectContaining({
      session: {
        namespace: 'webmcp-kit-test-lab',
        ownerId: 'local-developer',
        conversationId: 'chat'
      }
    })
  )
})
