import { afterEach, expect, it, vi } from 'vitest'
import { listTools } from '@vampaz/webmcp-kit'
import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import ToolkitExamples from './ToolkitExamples.vue'
import { mountWithDeps } from './test-utils/mount-with-deps'

function toolNames() {
  return listTools()
    .map(function name(registration) {
      return registration.tool.name
    })
    .sort()
}

afterEach(function cleanup() {
  clearToolsForTest()
  document.body.replaceChildren()
})

it('registers the toolkit examples only while the view is mounted', async function toolkit() {
  const wrapper = mountWithDeps(ToolkitExamples, { attachTo: document.body })
  const devtoolsHost = wrapper.get('section[aria-labelledby="devtools-title"] > div').element
  await vi.waitFor(function devtoolsMounted() {
    expect(devtoolsHost.childElementCount).toBe(1)
  })
  expect(wrapper.find('webmcp-command-input').exists()).toBe(true)
  expect(toolNames()).toEqual(['fill_contact_form', 'format_greeting'])
  await wrapper.get('label.toolkit-choice input[type="checkbox"]').setValue(false)
  expect(toolNames()).toEqual(['fill_contact_form'])
  wrapper.unmount()
  expect(toolNames()).toEqual([])
})
