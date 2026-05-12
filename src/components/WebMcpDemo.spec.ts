import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest } from '@webmcp-kit/core'

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

  it('registers tools and executes a natural language command', async () => {
    const wrapper = mountWithDeps(WebMcpDemo)
    await flushPromises()

    expect(wrapper.text()).toContain('Registered tools')
    expect(document.body.textContent).toContain('create_invoice')

    await wrapper.find('.primary-action').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Invoice created')
    expect(wrapper.text()).toContain('Acme')
  })

  it('selects checklist items from AI-chosen context IDs', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (message: string) => {
          if (message.includes('French')) {
            return JSON.stringify({
              toolName: 'select_items',
              input: { ids: ['item_4', 'item_7'] },
              confidence: 0.94,
              reason: 'Selected French foods from current checklist context.'
            })
          }

          return JSON.stringify({
            toolName: 'select_items',
            input: { ids: ['item_3', 'item_9'] },
            confidence: 0.91,
            reason: 'Selected root vegetables from current checklist context.'
          })
        }
      })
    }

    const wrapper = mountWithDeps(WebMcpDemo)
    await flushPromises()

    await wrapper.find('textarea[aria-label="Natural language command"]').setValue('Select all the foods that are French')
    await wrapper.find('.primary-action').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('2 selected')
    expect(wrapper.text()).toContain('Selected 2 checklist items')

    await wrapper.find('textarea[aria-label="Natural language command"]').setValue('Select all the ones that are roots')
    await wrapper.find('.primary-action').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('2 selected')
    expect(wrapper.text()).toContain('Beetroot')
  })
})
