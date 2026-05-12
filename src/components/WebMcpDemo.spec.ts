import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearToolsForTest } from '@webmcp-kit/core'

import WebMcpDemo from './WebMcpDemo.vue'
import { mountWithDeps } from '@/test-utils/mount-with-deps'

describe('WebMcpDemo', () => {
  beforeEach(() => {
    clearToolsForTest()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearToolsForTest()
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
})
