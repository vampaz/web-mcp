import { beforeEach, describe, expect, it } from 'vitest'

import { setConfirmationHandler } from './confirmation'
import { defineTool } from './define-tool'
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
          required: true,
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

    const result = await window.__webMCPKit?.invokeTool({
      toolName: 'checkout_cart',
      input: {},
      confirmed: true
    })

    expect(result).toMatchObject({
      status: 'blocked',
      error: 'Checkout requires approval.'
    })
  })
})
