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
    const { defineTool, listTools } = await import('@vampaz/webmcp-kit')
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
    const { defineTool, listTools } = await import('@vampaz/webmcp-kit')
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
    const { defineTool, listTools } = await import('@vampaz/webmcp-kit')
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

  it('preserves approval across inline rerenders and invokes the committed callback', async () => {
    const runtime = createReactHookRuntime()
    vi.doMock('react', function mockReact() {
      return runtime
    })
    const { useWebMCPTool } = await import('./index')
    const { defineTool, invokeTool, listTools, setConfirmationHandler } =
      await import('@vampaz/webmcp-kit')
    let approve!: (approved: boolean) => void
    const dispose = setConfirmationHandler(function confirm() {
      return new Promise<boolean>(function pending(resolve) {
        approve = resolve
      })
    })
    let version = 1
    function render() {
      const committedVersion = version
      useWebMCPTool(
        defineTool({
          name: 'save_note',
          description: 'Save the note in the active workspace.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          confirmation: { reason: 'Save this note?' },
          execute() {
            return committedVersion
          }
        })
      )
    }
    runtime.render(render)
    const registration = listTools()[0]
    const invocation = invokeTool({ toolName: 'save_note', input: {} })
    version = 2
    runtime.render(render)
    expect(listTools()[0]).toBe(registration)
    approve(true)
    expect(await invocation).toMatchObject({ status: 'success', output: 2 })
    runtime.cleanup()
    dispose()
  })

  it('respects a false when option', async () => {
    const runtime = createReactHookRuntime()
    vi.doMock('react', function mockReact() {
      return runtime
    })

    const { useWebMCPTool } = await import('./index')
    const { defineTool, listTools } = await import('@vampaz/webmcp-kit')

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

describe('React useWebMCPTools', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('react')
  })

  async function setup() {
    const runtime = createReactHookRuntime()
    vi.doMock('react', function mockReact() {
      return runtime
    })
    const { useWebMCPTools } = await import('./index')
    const kit = await import('@vampaz/webmcp-kit')

    function createTool(name: string, execute: () => unknown = () => name) {
      return kit.defineTool({
        name,
        description: `Run ${name} from the current React screen.`,
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        execute
      })
    }

    function getToolNames() {
      return kit.listTools().map((registration) => registration.tool.name)
    }

    return { createTool, getToolNames, kit, runtime, useWebMCPTools }
  }

  it('registers the tool set after effects run and unregisters it on cleanup', async () => {
    const { createTool, getToolNames, runtime, useWebMCPTools } = await setup()
    const handles: Array<ReturnType<typeof useWebMCPTools>> = []
    function render() {
      handles.push(useWebMCPTools([createTool('read_cart'), createTool('clear_cart')]))
    }

    runtime.render(render)
    runtime.render(render)

    expect(getToolNames()).toEqual(['read_cart', 'clear_cart'])
    expect(handles[0]).toBe(handles[1])
    expect(handles[0]!.getRegistrations().map((registration) => registration.tool.name)).toEqual([
      'read_cart',
      'clear_cart'
    ])

    runtime.cleanup()

    expect(getToolNames()).toEqual([])
    expect(handles[0]!.getRegistrations()).toEqual([])
  })

  it('registers and unregisters the set as the when option toggles', async () => {
    const { createTool, getToolNames, runtime, useWebMCPTools } = await setup()
    let available = false
    function render() {
      useWebMCPTools([createTool('read_cart'), createTool('clear_cart')], { when: available })
    }

    runtime.render(render)
    expect(getToolNames()).toEqual([])

    available = true
    runtime.render(render)
    expect(getToolNames()).toEqual(['read_cart', 'clear_cart'])

    available = false
    runtime.render(render)
    expect(getToolNames()).toEqual([])

    runtime.cleanup()
  })

  it('keeps registrations across inline rerenders and invokes committed callbacks', async () => {
    const { createTool, kit, runtime, useWebMCPTools } = await setup()
    let approve!: (approved: boolean) => void
    const dispose = kit.setConfirmationHandler(function confirm() {
      return new Promise<boolean>(function pending(resolve) {
        approve = resolve
      })
    })
    let version = 1
    function render() {
      const committedVersion = version
      useWebMCPTools([
        createTool('read_cart'),
        kit.defineTool({
          name: 'clear_cart',
          description: 'Clear every line from the current cart.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          confirmation: { reason: 'Clear the cart?' },
          execute() {
            return committedVersion
          }
        })
      ])
    }

    runtime.render(render)
    const registrations = kit.listTools()
    const invocation = kit.invokeTool({ toolName: 'clear_cart', input: {} })
    version = 2
    runtime.render(render)

    expect(kit.listTools()[0]).toBe(registrations[0])
    expect(kit.listTools()[1]).toBe(registrations[1])
    approve(true)
    expect(await invocation).toMatchObject({ status: 'success', output: 2 })
    runtime.cleanup()
    dispose()
  })

  it('re-registers the set when a tool definition changes', async () => {
    const { createTool, getToolNames, runtime, useWebMCPTools } = await setup()
    let names = ['read_cart']
    function render() {
      useWebMCPTools(names.map((name) => createTool(name)))
    }

    runtime.render(render)
    expect(getToolNames()).toEqual(['read_cart'])

    names = ['read_cart', 'clear_cart']
    runtime.render(render)
    expect(getToolNames()).toEqual(['read_cart', 'clear_cart'])

    runtime.cleanup()
    expect(getToolNames()).toEqual([])
  })

  it('registers no tool from the set when one name is already registered', async () => {
    const { createTool, kit, runtime, useWebMCPTools } = await setup()
    const existing = kit.registerTool(createTool('clear_cart'))

    expect(function render() {
      runtime.render(function renderHook() {
        useWebMCPTools([createTool('read_cart'), createTool('clear_cart')])
      })
    }).toThrow('"clear_cart" is already registered')

    expect(kit.listTools()).toEqual([existing])
    runtime.cleanup()
    expect(kit.listTools()).toEqual([existing])
  })
})

function createReactHookRuntime() {
  const refs: Array<{ current: unknown }> = []
  let refIndex = 0
  let effectIndex = 0
  const states: Array<{ dependencies?: unknown[]; cleanup?: () => void }> = []
  let effects: Array<() => void> = []

  function useRef<T>(initialValue: T) {
    const index = refIndex++
    refs[index] ??= { current: initialValue }
    return refs[index] as { current: T }
  }

  function useEffect(effect: EffectCallback, dependencies?: unknown[]) {
    const index = effectIndex++
    const previous = states[index]
    const changed =
      !dependencies ||
      !previous?.dependencies ||
      dependencies.some(function differs(value, i) {
        return !Object.is(value, previous.dependencies?.[i])
      })
    if (!changed) return
    effects.push(function commitEffect() {
      previous?.cleanup?.()
      const cleanup = effect()
      states[index] = { dependencies, cleanup: typeof cleanup === 'function' ? cleanup : undefined }
    })
  }

  function render(renderHook: () => void) {
    refIndex = 0
    effectIndex = 0
    effects = []
    renderHook()
    for (const effect of effects) effect()
  }

  function cleanup() {
    for (const state of states) state.cleanup?.()
    states.length = 0
  }

  return { cleanup, render, useEffect, useRef }
}
