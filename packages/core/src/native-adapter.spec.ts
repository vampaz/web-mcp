import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineTool } from './define-tool'
import { clearToolsForTest, registerTool } from './registry'
import { isWebMCPSupported } from './support'

interface NavigatorWithModelContext extends Navigator {
  modelContext?: {
    registerTool?: ReturnType<typeof vi.fn>
  }
}

describe('native WebMCP adapter', () => {
  beforeEach(() => {
    clearToolsForTest()
    delete (navigator as NavigatorWithModelContext).modelContext
  })

  afterEach(() => {
    clearToolsForTest()
    delete (navigator as NavigatorWithModelContext).modelContext
  })

  it('detects missing native WebMCP support', () => {
    expect(isWebMCPSupported()).toBe(false)
  })

  it('registers with native WebMCP when the browser API exists', () => {
    const unregister = vi.fn()
    const registerNativeTool = vi.fn(function registerNativeToolMock() {
      return { unregister }
    })
    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool: registerNativeTool
    }

    const registration = registerTool(defineTool({
      name: 'search_products',
      description: 'Search the local product catalog and return matching products for the current shopper.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query']
      },
      execute(input) {
        return { query: input.query }
      }
    }))

    expect(isWebMCPSupported()).toBe(true)
    expect(registration.mode).toBe('native-and-fallback')
    expect(registerNativeTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'search_products',
      description: expect.stringContaining('Search the local product catalog')
    }))

    registration.unregister()

    expect(unregister).toHaveBeenCalledOnce()
  })

  it('unregisters a previous native handle when a tool is replaced', () => {
    const firstUnregister = vi.fn()
    const secondUnregister = vi.fn()
    const registerNativeTool = vi
      .fn()
      .mockReturnValueOnce({ unregister: firstUnregister })
      .mockReturnValueOnce({ unregister: secondUnregister })

    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool: registerNativeTool
    }

    const baseTool = {
      name: 'create_invoice',
      description: 'Create a draft invoice for a customer and add it to the local invoice list.',
      inputSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number' }
        },
        required: ['amount']
      },
      execute(input: Record<string, unknown>) {
        return input
      }
    }

    registerTool(defineTool(baseTool))
    registerTool(defineTool({
      ...baseTool,
      description: 'Create a draft invoice with an updated description for the current workspace.'
    }))

    expect(firstUnregister).toHaveBeenCalledOnce()
    expect(secondUnregister).not.toHaveBeenCalled()
  })
})
