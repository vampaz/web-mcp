import { createSSRApp, defineComponent, nextTick, onMounted, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import { defineTool, invokeTool, listTools } from '@vampaz/webmcp-kit'

import { useWebMCPTool } from './index'
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
