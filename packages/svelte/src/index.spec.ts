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

describe('Svelte useWebMCPTools', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('svelte')
  })

  async function setup() {
    const mountCallbacks: MountCallback[] = []
    vi.doMock('svelte', function mockSvelte() {
      return {
        onMount(callback: MountCallback) {
          mountCallbacks.push(callback)
        }
      }
    })
    const { useWebMCPTools } = await import('./index')
    const kit = await import('@vampaz/webmcp-kit')

    function createTool(name: string) {
      return kit.defineTool({
        name,
        description: `Run ${name} from a Svelte component.`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute() {
          return name
        }
      })
    }

    function getToolNames() {
      return kit.listTools().map((registration) => registration.tool.name)
    }

    function mount() {
      const destroy = mountCallbacks[0]?.()
      return typeof destroy === 'function' ? destroy : () => {}
    }

    return { createTool, getToolNames, kit, mount, useWebMCPTools }
  }

  it('registers the tool set on mount and unregisters it on destroy', async () => {
    const { createTool, getToolNames, mount, useWebMCPTools } = await setup()
    const handle = useWebMCPTools([createTool('read_cart'), createTool('clear_cart')])

    expect(handle.getRegistrations()).toEqual([])
    const destroy = mount()
    expect(getToolNames()).toEqual(['read_cart', 'clear_cart'])
    expect(handle.getRegistrations().map((registration) => registration.tool.name)).toEqual([
      'read_cart',
      'clear_cart'
    ])

    destroy()
    expect(getToolNames()).toEqual([])
    expect(handle.getRegistrations()).toEqual([])
  })

  it('reacts to a readable when store', async () => {
    const { createTool, getToolNames, mount, useWebMCPTools } = await setup()
    const available = writable(false)
    useWebMCPTools([createTool('read_cart'), createTool('clear_cart')], { when: available })

    const destroy = mount()
    expect(getToolNames()).toEqual([])

    available.set(true)
    expect(getToolNames()).toEqual(['read_cart', 'clear_cart'])

    available.set(false)
    expect(getToolNames()).toEqual([])

    available.set(true)
    destroy()
    expect(getToolNames()).toEqual([])
  })

  it('respects a false when option', async () => {
    const { createTool, getToolNames, mount, useWebMCPTools } = await setup()
    useWebMCPTools([createTool('read_cart')], { when: false })

    mount()
    expect(getToolNames()).toEqual([])
  })

  it('registers no tool from the set when one name is already registered', async () => {
    const { createTool, kit, mount, useWebMCPTools } = await setup()
    const existing = kit.registerTool(createTool('clear_cart'))
    useWebMCPTools([createTool('read_cart'), createTool('clear_cart')])

    expect(mount).toThrow('"clear_cart" is already registered')
    expect(kit.listTools()).toEqual([existing])
  })
})
