import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest, invokeTool } from '@webmcp-kit/core'

import WebMcpDemo from './WebMcpDemo.vue'
import { mountWithDeps } from '@/test-utils/mount-with-deps'

interface WindowWithLanguageModel extends Window {
  LanguageModel?: {
    availability: (options?: unknown) => Promise<'available'>
    create: () => Promise<{
      prompt: (message: string) => Promise<string>
    }>
  }
}

describe('WebMcpDemo', () => {
  beforeEach(() => {
    clearToolsForTest()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearToolsForTest()
    delete (window as WindowWithLanguageModel).LanguageModel
    document.body.innerHTML = ''
  })

  it('starts with an empty command input and placeholder example', async () => {
    const wrapper = mountWithDeps(WebMcpDemo)
    await flushPromises()

    expect(wrapper.text()).toContain('Inventory')
    expect(wrapper.text()).toContain('Invoices')

    const commandInput = wrapper.find('input[aria-label="Natural language command"]')
    expect(commandInput.element).toHaveProperty('value', '')
    expect(commandInput.attributes('placeholder')).toBe('Try: Select all French items')
    expect(wrapper.find('.palette-run').attributes()).toHaveProperty('disabled')
    expect(wrapper.find('option[value="cloudflare-binding"]').exists()).toBe(true)

    await commandInput.setValue('Select all French items')
    await wrapper.find('.palette-command').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('5 selected')
    expect(wrapper.find('[aria-live="polite"]').text()).toBe('select_items completed.')
    expect(wrapper.text()).toContain('Croissant')
    expect(wrapper.text()).toContain('Pain au chocolat')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('operates visible controls from AI-chosen context IDs', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (message: string) => {
          if (message.includes('Open the Stark')) {
            return JSON.stringify({
              toolName: 'open_invoice',
              input: { id: 'inv_104' },
              confidence: 0.91,
              reason: 'Opened the matching invoice row.'
            })
          }

          if (message.includes('French')) {
            return JSON.stringify({
              toolName: 'select_items',
              input: { ids: ['item_4', 'item_7'] },
              confidence: 0.94,
              reason: 'Selected French items from current inventory context.'
            })
          }

          throw new Error('Unexpected prompt')
        }
      })
    }

    const wrapper = mountWithDeps(WebMcpDemo)
    await flushPromises()

    await wrapper.find('input[aria-label="Natural language command"]').setValue('Select all French items')
    await wrapper.find('.palette-command').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('2 selected')
    expect(wrapper.text()).toContain('Croissant')

    await wrapper.find('input[aria-label="Natural language command"]').setValue('Open the Stark invoice')
    await wrapper.find('.palette-command').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Stark Industries')
  })

  it('guards and confirms cart checkout', async () => {
    const wrapper = mountWithDeps(WebMcpDemo)
    await flushPromises()

    await expect(invokeTool({
      toolName: 'checkout_cart',
      input: {},
      confirmed: true
    })).resolves.toMatchObject({
      status: 'blocked',
      error: 'Cart is empty.'
    })

    await invokeTool({
      toolName: 'add_to_cart',
      input: {
        productId: 'kbd-01',
        quantity: 2
      }
    })
    await flushPromises()

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await expect(invokeTool({
      toolName: 'checkout_cart',
      input: {}
    })).resolves.toMatchObject({
      status: 'blocked',
      error: 'Checkout clears the cart and represents a purchase action.'
    })

    await expect(invokeTool({
      toolName: 'checkout_cart',
      input: {},
      confirmed: true
    })).resolves.toMatchObject({
      status: 'success',
      output: {
        total: 258
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('No cart lines yet.')
  })
})
