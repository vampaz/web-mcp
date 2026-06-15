import { writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MountCallback = () => void | (() => void)

describe('Svelte useWebMCPTool', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('svelte')
  })

  it('registers a tool on mount and unregisters on destroy', async () => {
    const mountCallbacks: MountCallback[] = []
    vi.doMock('svelte', function mockSvelte() {
      return {
        onMount(callback: MountCallback) {
          mountCallbacks.push(callback)
        }
      }
    })

    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('@vampaz/webmcp-kit')

    useWebMCPTool(
      defineTool({
        name: 'search_products',
        description: 'Search the local product catalog from a Svelte component.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query'],
          additionalProperties: false
        },
        execute(input) {
          return input
        }
      })
    )

    const destroy = mountCallbacks[0]?.()

    expect(
      listTools().map(function getToolName(registration) {
        return registration.tool.name
      })
    ).toEqual(['search_products'])

    if (typeof destroy === 'function') destroy()

    expect(listTools()).toEqual([])
  })

  it('reacts to a readable when store', async () => {
    const mountCallbacks: MountCallback[] = []
    vi.doMock('svelte', function mockSvelte() {
      return {
        onMount(callback: MountCallback) {
          mountCallbacks.push(callback)
        }
      }
    })

    const available = writable(false)
    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('@vampaz/webmcp-kit')

    useWebMCPTool(
      defineTool({
        name: 'search_products',
        description: 'Search the local product catalog from a Svelte component.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        execute() {
          return {}
        }
      }),
      {
        when: available
      }
    )

    const destroy = mountCallbacks[0]?.()
    expect(listTools()).toEqual([])

    available.set(true)
    expect(listTools()).toHaveLength(1)

    available.set(false)
    expect(listTools()).toEqual([])

    if (typeof destroy === 'function') destroy()
    expect(listTools()).toEqual([])
  })

  it('returns a handle with unregister and getRegistration', async () => {
    const mountCallbacks: MountCallback[] = []
    vi.doMock('svelte', function mockSvelte() {
      return {
        onMount(callback: MountCallback) {
          mountCallbacks.push(callback)
        }
      }
    })

    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('@vampaz/webmcp-kit')

    const handle = useWebMCPTool(
      defineTool({
        name: 'search_products',
        description: 'Search the local product catalog from a Svelte component.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        execute() {
          return {}
        }
      })
    )

    expect(handle.getRegistration()).toBeUndefined()

    const destroy = mountCallbacks[0]?.()

    expect(handle.getRegistration()?.tool.name).toBe('search_products')

    handle.unregister()

    expect(listTools()).toEqual([])
    expect(handle.getRegistration()).toBeUndefined()

    if (typeof destroy === 'function') destroy()
  })
})
