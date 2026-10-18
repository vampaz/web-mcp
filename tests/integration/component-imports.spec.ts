// @vitest-environment node
import { expect, it, vi } from 'vitest'

it('imports all public component entries without DOM, network, or Pi initialization', async function test() {
  const fetch = vi.fn(function forbidden() {
    throw new Error('Import performed network activity')
  })
  vi.stubGlobal('fetch', fetch)
  const core = await import('@vampaz/webmcp-kit')
  const pi = await import('@vampaz/webmcp-kit/pi')
  const chat = await import('@vampaz/webmcp-kit/chat')
  expect(core.registerTool).toBeTypeOf('function')
  expect(pi.createPiHarness).toBeTypeOf('function')
  expect(chat.defineWebMCPChat).toBeTypeOf('function')
  expect(function ssr() {
    chat.defineWebMCPChat()
  }).not.toThrow()
  expect(fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
