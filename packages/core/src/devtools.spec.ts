import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineTool } from './define-tool'
import { mountDevtoolsOverlay } from './devtools'
import { clearToolsForTest, registerTool } from './registry'

describe('devtools overlay', () => {
  beforeEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders registered tools and invokes them', async () => {
    const execute = vi.fn(function executeTool() {
      return { ok: true }
    })

    registerTool(defineTool({
      name: 'create_invoice',
      description: 'Create a draft invoice for a customer and add it to the local invoice list.',
      inputSchema: {
        type: 'object',
        properties: {
          customerName: { type: 'string' },
          amount: { type: 'number', minimum: 1 }
        },
        required: ['customerName', 'amount']
      },
      execute
    }))

    const overlay = mountDevtoolsOverlay()

    expect(document.body.textContent).toContain('Tool Inspector')
    expect(document.body.textContent).toContain('create_invoice')

    const invokeButton = document.querySelector<HTMLButtonElement>('button[data-action="invoke"]')
    invokeButton?.click()
    await new Promise((resolve) => window.setTimeout(resolve))

    expect(execute).toHaveBeenCalledWith({ customerName: 'Acme Corp', amount: 1 }, { source: 'devtools' })
    expect(document.body.textContent).toContain('Invocation history')

    overlay.destroy()
    expect(document.body.textContent).not.toContain('Tool Inspector')
  })
})
