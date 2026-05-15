import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineTool } from './define-tool'
import { setConfirmationHandler } from './index'
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
    setConfirmationHandler(undefined)
    delete (navigator as NavigatorWithModelContext).modelContext
  })

  afterEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
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

  it('supports dispose-only native handles', () => {
    const dispose = vi.fn()
    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool: vi.fn(function registerNativeToolMock() {
        return { dispose }
      })
    }

    const registration = registerTool(defineTool({
      name: 'create_ticket',
      description: 'Create a support ticket for the currently visible customer account.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string' }
        },
        required: ['subject']
      },
      execute(input) {
        return input
      }
    }))

    registration.unregister()

    expect(dispose).toHaveBeenCalledOnce()
  })

  it('surfaces a compatibility warning for unexpected native handles', () => {
    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool: vi.fn(function registerNativeToolMock() {
        return { close: vi.fn() }
      })
    }

    const registration = registerTool(defineTool({
      name: 'select_items',
      description: 'Select checklist items by stable IDs from the current visible checklist.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['ids']
      },
      execute(input) {
        return input
      }
    }))

    expect(registration.mode).toBe('native-and-fallback')
    expect(registration.warnings).toContain('Native WebMCP registration returned a handle without unregister or dispose; local unregister cannot remove the native tool.')
  })

  it('executes native calls with native source context', async () => {
    let nativeExecute: ((input: Record<string, unknown>) => unknown) | undefined
    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool: vi.fn(function registerNativeToolMock(nativeTool) {
        nativeExecute = nativeTool.execute
        return undefined
      })
    }

    registerTool(defineTool({
      name: 'search_products',
      description: 'Search the local product catalog and return matching products for the current shopper.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query']
      },
      execute(input, context) {
        return { query: input.query, source: context.source }
      }
    }))

    expect(await nativeExecute?.({ query: 'dock' })).toEqual({
      query: 'dock',
      source: 'native'
    })
  })

  it('validates native input before executing handlers', async () => {
    let nativeExecute: ((input: Record<string, unknown>) => unknown) | undefined
    const execute = vi.fn(function searchProducts(input: Record<string, unknown>) {
      return input
    })

    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool: vi.fn(function registerNativeToolMock(nativeTool) {
        nativeExecute = nativeTool.execute
        return undefined
      })
    }

    registerTool(defineTool({
      name: 'search_products',
      description: 'Search the local product catalog and return matching products for the current shopper.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query']
      },
      execute
    }))

    await expect(nativeExecute?.({ query: 42 })).rejects.toThrow('input validation failed: /query expected string, got integer.')
    expect(execute).not.toHaveBeenCalled()
  })

  it('uses the configured confirmation handler before native execution', async () => {
    let nativeExecute: ((input: Record<string, unknown>) => unknown) | undefined
    const confirm = vi.fn(function confirmInvocation() {
      return true
    })
    const execute = vi.fn(function voidInvoice(input: Record<string, unknown>) {
      return input
    })

    setConfirmationHandler(confirm)
    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool: vi.fn(function registerNativeToolMock(nativeTool) {
        nativeExecute = nativeTool.execute
        return undefined
      })
    }

    registerTool(defineTool({
      name: 'void_invoice',
      description: 'Void an existing invoice after the user has reviewed the pending action.',
      inputSchema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' }
        },
        required: ['invoiceId']
      },
      confirmation: {
        required: true,
        reason: 'Voiding an invoice cannot be undone in this demo.'
      },
      execute
    }))

    await expect(nativeExecute?.({ invoiceId: 'inv_1' })).resolves.toEqual({ invoiceId: 'inv_1' })
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'void_invoice' }),
      { invoiceId: 'inv_1' },
      'Voiding an invoice cannot be undone in this demo.'
    )
    expect(execute).toHaveBeenCalledWith({ invoiceId: 'inv_1' }, { source: 'native' })
  })
})
