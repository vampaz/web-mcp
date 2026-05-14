import { beforeEach, describe, expect, it } from 'vitest'

import { defineTool } from './define-tool'
import { clearToolsForTest, registerTool } from './registry'
import { installWebMCPKitTestBridge } from './test-bridge'

describe('test bridge', () => {
  beforeEach(() => {
    clearToolsForTest()
    delete window.__webMCPKit
  })

  it('exposes serializable tool summaries and invocation for tests', async () => {
    registerTool(defineTool({
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
    }))

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
})
