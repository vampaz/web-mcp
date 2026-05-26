import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearToolsForTest, defineTool, invokeTool, listTools } from 'webmcp-kit'

import { useWebMCPTool } from './index'
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
