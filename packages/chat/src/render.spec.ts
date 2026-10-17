import { expect, it } from 'vitest'
import { updateTranscript, statusText } from './render'

it('keeps expanded tool details while updating text without interpreting HTML', function test() {
  const list = document.createElement('ol')
  updateTranscript(
    list,
    [{ id: 'tool', role: 'tool', toolName: 'read', text: 'first' }],
    'Assistant'
  )
  const details = list.querySelector('details')!
  expect(details.open).toBe(false)
  details.open = true
  updateTranscript(
    list,
    [{ id: 'tool', role: 'tool', toolName: 'read', text: '<script>bad()</script>' }],
    'Assistant'
  )
  expect(list.querySelector('details')).toBe(details)
  expect(details.open).toBe(true)
  expect(list.querySelector('script')).toBeNull()
  const observer = new MutationObserver(function changed() {})
  observer.observe(list, { childList: true, characterData: true, subtree: true })
  updateTranscript(
    list,
    [{ id: 'tool', role: 'tool', toolName: 'read', text: '<script>bad()</script>' }],
    'Assistant'
  )
  expect(observer.takeRecords()).toEqual([])
  observer.disconnect()
  updateTranscript(list, [], 'Assistant')
  expect(list.children.length).toBe(0)
})
it('explains interrupted work and displays structured errors', function test() {
  expect(statusText({ state: 'interrupted', messages: [] })).toContain('Check application state')
  expect(
    statusText({
      state: 'error',
      messages: [],
      error: { code: 'configuration', message: 'Configure a controller' }
    })
  ).toBe('Configure a controller')
})

it('keeps tool results collapsed and marks failed answers after recovery', function test() {
  const list = document.createElement('ol')
  const messages = [
    { id: 'tool', role: 'tool' as const, toolName: 'read_counter', text: '{"value":7}' },
    {
      id: 'answer',
      role: 'assistant' as const,
      text: 'HTTP 503 <script>bad()</script>',
      failed: true
    }
  ]
  updateTranscript(list, messages, 'Helper')
  expect(list.children[0].querySelector('summary')!.textContent).toBe('read_counter')
  expect(list.children[0].querySelector('details')!.open).toBe(false)
  expect(list.children[1].querySelector('strong')!.textContent).toBe('Helper — response failed')
  expect(list.children[1].querySelector('p')!.textContent).toContain('Check application state')
  expect(list.children[1].querySelector('pre')!.textContent).toBe(messages[1].text)
  expect(list.querySelector('script')).toBeNull()
  expect(statusText({ state: 'idle', messages })).toContain('last response failed')
  updateTranscript(list, [{ id: 'answer', role: 'assistant', text: 'Successful answer' }], 'Helper')
  expect(list.querySelector('details')).toBeNull()
  expect(list.querySelector('strong')!.textContent).toBe('Helper')
})
