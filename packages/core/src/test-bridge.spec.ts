import { beforeEach, describe, expect, it } from 'vitest'

import { setConfirmationHandler } from './confirmation'
import { defineTool } from './define-tool'
import { subscribeWebMCPKitEvents } from './events'
import type { ToolInvocation, WebMCPKitEvent } from './interfaces/tool'
import { clearToolsForTest, registerTool } from './registry'
import { installWebMCPKitTestBridge } from './test-bridge'

describe('test bridge', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
    delete window.__webMCPKit
  })

  it('exposes serializable tool summaries and invocation for tests', async () => {
    registerTool(
      defineTool({
        name: 'select_items',
        description: 'Select checklist items by their stable IDs from the visible page state.',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: {
                type: 'string'
              }
            }
          },
          required: ['ids']
        },
        execute(input) {
          return input.ids
        }
      })
    )

    const uninstall = installWebMCPKitTestBridge()

    expect(window.__webMCPKit?.listTools()).toEqual([
      expect.objectContaining({
        name: 'select_items',
        available: true,
        mode: 'fallback'
      })
    ])

    const result = await window.__webMCPKit?.invokeTool({
      toolName: 'select_items',
      input: {
        ids: ['item_1']
      }
    })

    expect(result?.status).toBe('success')
    expect(result?.output).toEqual(['item_1'])

    uninstall()
    expect(window.__webMCPKit).toBeUndefined()
  })

  it('reports a failed scope without hiding other tools', () => {
    for (const name of ['broken', 'working'])
      registerTool(
        defineTool({
          name,
          description: 'Read the current state.',
          inputSchema: { type: 'object', properties: {} },
          scope() {
            if (name === 'broken') throw new Error('State missing')
            return { available: true }
          },
          execute() {
            return {}
          }
        })
      )
    installWebMCPKitTestBridge()
    expect(window.__webMCPKit?.listTools()).toEqual([
      expect.objectContaining({
        name: 'broken',
        available: false,
        unavailableReason: 'State missing'
      }),
      expect.objectContaining({ name: 'working', available: true })
    ])
  })

  it('does not let test callers bypass confirmation', async () => {
    setConfirmationHandler(function rejectConfirmation() {
      return false
    })

    registerTool(
      defineTool({
        name: 'checkout_cart',
        description: 'Checkout the current cart.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        confirmation: {
          reason: 'Checkout requires approval.'
        },
        execute() {
          return {
            ok: true
          }
        }
      })
    )

    installWebMCPKitTestBridge()

    const events: WebMCPKitEvent[] = []
    const unsubscribe = subscribeWebMCPKitEvents(function record(event) {
      events.push(event)
    })
    const result = await window.__webMCPKit?.invokeTool({
      toolName: 'checkout_cart',
      input: {},
      confirmed: true,
      source: 'native'
    } as ToolInvocation)
    unsubscribe()

    expect(result).toMatchObject({
      status: 'blocked',
      error: 'Checkout requires approval.'
    })
    expect(events.find((event) => event.type === 'invoked')?.detail).toMatchObject({
      source: 'fallback'
    })
  })
})
