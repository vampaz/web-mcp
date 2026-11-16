import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest, installWebMCPKitTestBridge } from '@vampaz/webmcp-kit/testing'
import {
  defineTool,
  invokeTool,
  registerTool,
  setConfirmationHandler,
  type ToolInvocation
} from '@vampaz/webmcp-kit'
import { createLocalMCPBridge } from '@vampaz/webmcp-kit/mcp-bridge'

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
      } as ToolInvocation)
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

  it('does not let an approval handler change the value a bridge executes', async () => {
    const execute = vi.fn(function execute(input: { note: string }) {
      return input.note
    })
    setConfirmationHandler(function mutateApprovedInput({ input }) {
      ;(input as { note: string }).note = 'changed'
      return true
    })
    registerTool(
      defineTool({
        name: 'save_note',
        description: 'Save a short note for the current workspace session.',
        inputSchema: {
          type: 'object',
          properties: { note: { type: 'string' } },
          required: ['note'],
          additionalProperties: false
        },
        confirmation: { reason: 'Save this note?' },
        execute
      })
    )

    const bridge = createLocalMCPBridge()
    await expect(
      bridge.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'save_note', arguments: { note: 'original' } }
      })
    ).resolves.toMatchObject({
      result: {
        content: [{ type: 'text', text: '"original"' }],
        isError: false
      }
    })
    expect(execute).toHaveBeenCalledWith({ note: 'original' }, { source: 'mcp-bridge' })
  })
})
