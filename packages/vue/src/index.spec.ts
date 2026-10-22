import { createSSRApp, defineComponent, nextTick, onMounted, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import { defineTool, invokeTool, listTools, registerTool } from '@vampaz/webmcp-kit'

import { useWebMCPTool, useWebMCPTools } from './index'
import { renderToString } from 'vue/server-renderer'
import { mountWithDeps } from './test-utils/mount-with-deps'

describe('useWebMCPTool', () => {
  beforeEach(() => {
    clearToolsForTest()
  })

  afterEach(() => {
    clearToolsForTest()
  })

  it('registers a tool for the component scope and unregisters on unmount', () => {
    const component = defineComponent({
      setup() {
        useWebMCPTool(
          defineTool({
            name: 'create_ticket',
            description: 'Create a support ticket from the current Vue screen.',
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
        )

        return function render() {
          return null
        }
      }
    })

    const wrapper = mountWithDeps(component)

    expect(
      listTools().map(function getToolName(registration) {
        return registration.tool.name
      })
    ).toEqual(['create_ticket'])

    wrapper.unmount()

    expect(listTools()).toEqual([])
  })

  it('registers when called from an already mounted component effect scope', () => {
    const component = defineComponent({
      setup() {
        onMounted(function mounted() {
          useWebMCPTool(
            defineTool({
              name: 'read_mounted',
              description: 'Read the mounted application state.',
              inputSchema: { type: 'object', properties: {} },
              execute() {
                return 1
              }
            })
          )
        })
        return function render() {
          return null
        }
      }
    })
    const wrapper = mountWithDeps(component)
    expect(listTools().map((registration) => registration.tool.name)).toEqual(['read_mounted'])
    wrapper.unmount()
    expect(listTools()).toEqual([])
  })

  it('does not register component tools during SSR', async () => {
    const component = defineComponent({
      setup() {
        useWebMCPTool(
          defineTool({
            name: 'read_value',
            description: 'Read the current value.',
            inputSchema: { type: 'object', properties: {} },
            execute() {
              return 1
            }
          })
        )
        return function render() {
          return null
        }
      }
    })
    await renderToString(createSSRApp(component))
    await renderToString(createSSRApp(component))
    expect(listTools()).toEqual([])
  })

  it('reacts to a dynamic when option', async () => {
    const available = ref(false)
    const component = defineComponent({
      setup() {
        useWebMCPTool(
          defineTool({
            name: 'create_ticket',
            description: 'Create a support ticket from the current Vue screen.',
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
          }),
          {
            when: available
          }
        )

        return function render() {
          return null
        }
      }
    })

    mountWithDeps(component)

    expect(listTools()).toEqual([])

    available.value = true
    await nextTick()

    expect(listTools()).toHaveLength(1)
    await expect(
      invokeTool({
        toolName: 'create_ticket',
        input: { subject: 'Billing' }
      })
    ).resolves.toMatchObject({
      status: 'success',
      output: { subject: 'Billing' }
    })

    available.value = false
    await nextTick()

    expect(listTools()).toEqual([])
  })
})

describe('useWebMCPTools', () => {
  beforeEach(() => {
    clearToolsForTest()
  })

  afterEach(() => {
    clearToolsForTest()
  })

  function createTool(name: string) {
    return defineTool({
      name,
      description: `Run ${name} from the current Vue screen.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute() {
        return name
      }
    })
  }

  function getToolNames() {
    return listTools().map((registration) => registration.tool.name)
  }

  it('registers the tool set on mount and unregisters it on unmount', () => {
    let handle!: ReturnType<typeof useWebMCPTools>
    const component = defineComponent({
      setup() {
        handle = useWebMCPTools([createTool('read_cart'), createTool('clear_cart')])
        expect(handle.getRegistrations()).toEqual([])
        return function render() {
          return null
        }
      }
    })

    const wrapper = mountWithDeps(component)
    expect(getToolNames()).toEqual(['read_cart', 'clear_cart'])
    expect(handle.getRegistrations().map((registration) => registration.tool.name)).toEqual([
      'read_cart',
      'clear_cart'
    ])

    wrapper.unmount()
    expect(listTools()).toEqual([])
    expect(handle.getRegistrations()).toEqual([])
  })

  it('does not register the tool set during SSR', async () => {
    const component = defineComponent({
      setup() {
        useWebMCPTools([createTool('read_cart')])
        return function render() {
          return null
        }
      }
    })
    await renderToString(createSSRApp(component))
    expect(listTools()).toEqual([])
  })

  it('reacts to a getter when option', async () => {
    const available = ref(false)
    const component = defineComponent({
      setup() {
        useWebMCPTools([createTool('read_cart'), createTool('clear_cart')], {
          when: () => available.value
        })
        return function render() {
          return null
        }
      }
    })

    const wrapper = mountWithDeps(component)
    expect(listTools()).toEqual([])

    available.value = true
    await nextTick()
    expect(getToolNames()).toEqual(['read_cart', 'clear_cart'])
    await expect(invokeTool({ toolName: 'clear_cart', input: {} })).resolves.toMatchObject({
      status: 'success',
      output: 'clear_cart'
    })

    available.value = false
    await nextTick()
    expect(listTools()).toEqual([])
    wrapper.unmount()
  })

  it('registers no tool from the set when one name is already registered', async () => {
    const existing = registerTool(createTool('clear_cart'))
    const available = ref(false)
    const errors: unknown[] = []
    const component = defineComponent({
      setup() {
        useWebMCPTools([createTool('read_cart'), createTool('clear_cart')], { when: available })
        return function render() {
          return null
        }
      }
    })
    const wrapper = mountWithDeps(component, {
      global: {
        config: {
          errorHandler(error) {
            errors.push(error)
          }
        }
      }
    })

    available.value = true
    await nextTick()

    expect(errors).toHaveLength(1)
    expect(String(errors[0])).toContain('"clear_cart" is already registered')
    expect(listTools()).toEqual([existing])
    wrapper.unmount()
    expect(listTools()).toEqual([existing])
  })
})
