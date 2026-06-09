import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type EffectCallback = () => void | (() => void)

describe('React useWebMCPTool', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('react')
  })

  it('registers a tool after effects run and unregisters on cleanup', async () => {
    const runtime = createReactHookRuntime()
    vi.doMock('react', function mockReact() {
      return runtime
    })

    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('webmcp-kit')
    const tool = defineTool({
      name: 'create_ticket',
      description: 'Create a support ticket from the current React screen.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string' }
        },
        required: ['subject'],
        additionalProperties: false
      },
      execute(input) {
        return input
      }
    })

    runtime.render(function renderHook() {
      useWebMCPTool(tool)
    })

    expect(
      listTools().map(function getToolName(registration) {
        return registration.tool.name
      })
    ).toEqual(['create_ticket'])

    runtime.cleanup()

    expect(listTools()).toEqual([])
  })

  it('registers and unregisters as the when option toggles across renders', async () => {
    const runtime = createReactHookRuntime()
    vi.doMock('react', function mockReact() {
      return runtime
    })

    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('webmcp-kit')
    const tool = defineTool({
      name: 'create_ticket',
      description: 'Create a support ticket from the current React screen.',
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

    let available = true
    function renderHook() {
      useWebMCPTool(tool, {
        when: available
      })
    }

    runtime.render(renderHook)

    expect(listTools()).toHaveLength(1)

    available = false
    runtime.render(renderHook)

    expect(listTools()).toEqual([])

    available = true
    runtime.render(renderHook)

    expect(listTools()).toHaveLength(1)

    runtime.cleanup()
  })

  it('returns a stable handle with unregister and getRegistration', async () => {
    const runtime = createReactHookRuntime()
    vi.doMock('react', function mockReact() {
      return runtime
    })

    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('webmcp-kit')
    const tool = defineTool({
      name: 'create_ticket',
      description: 'Create a support ticket from the current React screen.',
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

    const handles: unknown[] = []
    function renderHook() {
      handles.push(useWebMCPTool(tool))
    }

    runtime.render(renderHook)
    runtime.render(renderHook)

    expect(handles[0]).toBe(handles[1])

    const handle = handles[0] as {
      unregister: () => void
      getRegistration: () => { tool: { name: string } } | undefined
    }
    expect(handle.getRegistration()?.tool.name).toBe('create_ticket')

    handle.unregister()

    expect(listTools()).toEqual([])
    expect(handle.getRegistration()).toBeUndefined()

    runtime.cleanup()
  })

  it('respects a false when option', async () => {
    const runtime = createReactHookRuntime()
    vi.doMock('react', function mockReact() {
      return runtime
    })

    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('webmcp-kit')

    runtime.render(function renderHook() {
      useWebMCPTool(
        defineTool({
          name: 'create_ticket',
          description: 'Create a support ticket from the current React screen.',
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
          when: false
        }
      )
    })

    expect(listTools()).toEqual([])
  })
})

function createReactHookRuntime() {
  const refs: Array<{ current: unknown }> = []
  let refIndex = 0
  let cleanups: Array<() => void> = []
  let effects: EffectCallback[] = []

  function useRef<T>(initialValue: T) {
    const index = refIndex
    refIndex += 1

    if (!refs[index]) {
      refs[index] = {
        current: initialValue
      }
    }

    return refs[index] as { current: T }
  }

  function useEffect(effect: EffectCallback) {
    effects.push(effect)
  }

  function render(renderHook: () => void) {
    refIndex = 0
    effects = []
    renderHook()
    cleanups = effects.flatMap(function runEffect(effect) {
      const cleanup = effect()
      return typeof cleanup === 'function' ? [cleanup] : []
    })
  }

  function cleanup() {
    for (const cleanupEffect of cleanups) {
      cleanupEffect()
    }
    cleanups = []
  }

  return {
    cleanup,
    render,
    useEffect,
    useRef
  }
}
