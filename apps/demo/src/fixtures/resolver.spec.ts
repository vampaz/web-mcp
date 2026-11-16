import { describe, expect, it } from 'vitest'
import type { ToolResolver } from '@vampaz/webmcp-kit'
import { createFixtureResolver } from './resolver'

function resolve(
  resolver: ToolResolver,
  message: string,
  options?: Parameters<ToolResolver['resolve']>[3]
) {
  return resolver.resolve(message, [], {}, options)
}

describe('fixture resolver scripts', function fixture() {
  it('keeps provider failures repeatable', async function failures() {
    const resolver = createFixtureResolver()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(resolve(resolver, 'fail')).rejects.toThrow('Fixture provider failed')
    }
  })

  it('keeps invalid resolutions repeatable for correction retries', async function invalid() {
    const resolver = createFixtureResolver()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(resolve(resolver, 'invalid')).resolves.toMatchObject({
        toolName: 'not_a_tool'
      })
    }
  })

  it('keeps markdown responses repeatable', async function markdown() {
    const resolver = createFixtureResolver()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await resolve(resolver, 'markdown')
      expect(result.toolName).toBe('pi_reply')
      expect((result.input as { text: string }).text).toContain('Here is **bold**')
    }
  })

  it('keeps wait cancellation repeatable', async function wait() {
    const resolver = createFixtureResolver()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const pending = resolve(resolver, 'wait', { signal: controller.signal })
      controller.abort()
      await expect(pending).rejects.toThrow('cancelled')
    }
  })

  it('fails flaky once and then succeeds', async function flaky() {
    const resolver = createFixtureResolver()
    await expect(resolve(resolver, 'flaky')).rejects.toThrow('Fixture provider failed once')
    await expect(resolve(resolver, 'flaky')).resolves.toMatchObject({ toolName: 'pi_reply' })
  })

  it('fails after the write in the set-then-fail scenario', async function afterWrite() {
    const resolver = createFixtureResolver()
    await expect(resolve(resolver, 'set then fail')).resolves.toMatchObject({
      toolName: 'set_counter',
      input: { value: 6 }
    })
    await expect(
      resolver.resolve('set then fail', [], { piConversation: [{ role: 'toolResult' }] })
    ).rejects.toThrow('Fixture provider failed after the write')
  })
})
