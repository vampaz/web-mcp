import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearToolsForTest,
  defineTool,
  getRegistrySnapshot,
  installWebMCPKitTestBridge,
  registerTool
} from '@vampaz/webmcp-kit'

describe('fallback integration', () => {
  beforeEach(() => {
    clearToolsForTest()
    delete window.__webMCPKit
  })

  afterEach(() => {
    clearToolsForTest()
    delete window.__webMCPKit
  })

  it('exposes fallback tools through the dev/test bridge in unsupported browsers', async () => {
    registerTool(
      defineTool({
        name: 'create_note',
        description: 'Create a local note from the current unsupported-browser fallback test.',
        inputSchema: {
          type: 'object',
          properties: {
            body: {
              type: 'string',
              description: 'Note body.'
            }
          },
          required: ['body'],
          additionalProperties: false
        },
        execute(input) {
          return {
            body: input.body
          }
        }
      })
    )

    const uninstall = installWebMCPKitTestBridge()

    expect(getRegistrySnapshot()).toMatchObject({
      nativeWebMCP: false,
      toolCount: 1
    })
    expect(window.__webMCPKit?.listTools()).toMatchObject([
      {
        name: 'create_note',
        mode: 'fallback',
        available: true
      }
    ])

    await expect(
      window.__webMCPKit?.invokeTool({
        toolName: 'create_note',
        input: {
          body: 'Fallback works.'
        }
      })
    ).resolves.toMatchObject({
      status: 'success',
      output: {
        body: 'Fallback works.'
      }
    })

    uninstall()
    expect(window.__webMCPKit).toBeUndefined()
  })
})
