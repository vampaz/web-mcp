import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearToolsForTest,
  defineTool,
  installWebMCPKitTestBridge,
  invokeTool,
  registerTool,
  setConfirmationHandler
} from 'webmcp-kit'
import { createLocalMCPBridge } from 'webmcp-kit/mcp-bridge'

describe('cross-surface invocation semantics', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
    delete window.__webMCPKit
  })

  it('validates input before confirmation across fallback, test bridge, and MCP bridge', async () => {
    const confirm = vi.fn(function confirmInvocation() {
      return true
    })
    const execute = vi.fn(function executeTool(input: Record<string, unknown>) {
      return input
    })
    setConfirmationHandler(confirm)
    registerTool(
      defineTool({
        name: 'send_invoice',
        description: 'Send the selected invoice to the customer after explicit approval.',
        inputSchema: {
          type: 'object',
          properties: {
            invoiceId: {
              type: 'string'
            }
          },
          required: ['invoiceId'],
          additionalProperties: false
        },
        confirmation: {
          required: true,
          reason: 'Sending an invoice contacts the customer.'
        },
        execute
      })
    )

    await expect(
      invokeTool({
        toolName: 'send_invoice',
        input: {
          invoiceId: 123
        }
      })
    ).resolves.toMatchObject({
      status: 'error',
      error: 'input validation failed: /invoiceId expected string, got integer.'
    })

    installWebMCPKitTestBridge()
    await expect(
      window.__webMCPKit?.invokeTool({
        toolName: 'send_invoice',
        input: {
          invoiceId: 123
        },
        confirmed: true
      })
    ).resolves.toMatchObject({
      status: 'error',
      error: 'input validation failed: /invoiceId expected string, got integer.'
    })

    const bridge = createLocalMCPBridge()
    await expect(
      bridge.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'send_invoice',
          arguments: {
            invoiceId: 123
          },
          confirmed: true
        }
      })
    ).resolves.toMatchObject({
      result: {
        isError: true
      }
    })

    expect(confirm).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})
