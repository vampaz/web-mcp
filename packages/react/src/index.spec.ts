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
    const { defineTool, listTools } = await import('@webmcp-kit/core')
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

    expect(listTools().map(function getToolName(registration) {
      return registration.tool.name
    })).toEqual(['create_ticket'])

    runtime.cleanup()

    expect(listTools()).toEqual([])
  })

  it('respects a false when option', async () => {
    const runtime = createReactHookRuntime()
    vi.doMock('react', function mockReact() {
      return runtime
    })

    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('@webmcp-kit/core')

    runtime.render(function renderHook() {
      useWebMCPTool(defineTool({
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
      }), {
        when: false
      })
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
