import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const marker = Symbol.for('@vampaz/webmcp-kit/registry')

function clearMarker() {
  delete (globalThis as Record<PropertyKey, unknown>)[marker]
  vi.resetModules()
}

beforeEach(function reset() {
  clearMarker()
  vi.restoreAllMocks()
})

afterEach(function cleanup() {
  delete (globalThis as Record<PropertyKey, unknown>)[marker]
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('registry duplicate marker', function markerTests() {
  it('does not warn for the same cached module instance', async function cached() {
    const warn = vi.spyOn(console, 'warn').mockImplementation(function ignore() {})
    const first = await import('./registry')
    const second = await import('./registry')

    expect(second).toBe(first)
    expect(warn).not.toHaveBeenCalled()
    expect((globalThis as Record<PropertyKey, unknown>)[marker]).toMatchObject({
      warned: false
    })
  })

  it('warns once for distinct instances with the same URL while registries stay separate', async function independent() {
    const warn = vi.spyOn(console, 'warn').mockImplementation(function ignore() {})
    const first = await import('./registry')
    const { defineTool } = await import('./define-tool')
    first.registerTool(
      defineTool({
        name: 'first_copy_tool',
        description: 'A tool registered in the first module instance.',
        execute() {
          return 'first'
        }
      })
    )
    expect(first.listTools()).toHaveLength(1)

    vi.resetModules()
    const second = await import('./registry')
    expect(second.listTools()).toEqual([])
    expect(warn).toHaveBeenCalledOnce()

    vi.resetModules()
    const third = await import('./registry')
    expect(third.listTools()).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
  })

  it('sets no marker or warning in production', async function production() {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(function ignore() {})

    await import('./registry')

    expect((globalThis as Record<PropertyKey, unknown>)[marker]).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })
})
