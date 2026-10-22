import { expect, it, vi } from 'vitest'
import { activityText, updateTranscript, statusText } from './render'
import { createLabels } from './labels'

const labels = createLabels()

it('keeps expanded tool details while updating text without interpreting HTML', function test() {
  const list = document.createElement('ol')
  updateTranscript(
    list,
    [{ id: 'tool', role: 'tool', toolName: 'read', text: 'first' }],
    'Assistant',
    labels
  )
  const details = list.querySelector('details')!
  expect(details.open).toBe(false)
  details.open = true
  updateTranscript(
    list,
    [{ id: 'tool', role: 'tool', toolName: 'read', text: '<script>bad()</script>' }],
    'Assistant',
    labels
  )
  expect(list.querySelector('details')).toBe(details)
  expect(details.open).toBe(true)
  expect(list.querySelector('script')).toBeNull()
  const observer = new MutationObserver(function changed() {})
  observer.observe(list, { childList: true, characterData: true, subtree: true })
  expect(
    updateTranscript(
      list,
      [{ id: 'tool', role: 'tool', toolName: 'read', text: '<script>bad()</script>' }],
      'Assistant',
      labels
    )
  ).toBe(false)
  expect(observer.takeRecords()).toEqual([])
  observer.disconnect()
  expect(updateTranscript(list, [], 'Assistant', labels)).toBe(true)
  expect(list.children.length).toBe(0)
})

it('explains interrupted work, stays quiet when idle, and marks errors', function test() {
  expect(statusText({ state: 'interrupted', messages: [] }, labels).text).toContain(
    'Check application state'
  )
  expect(statusText({ state: 'idle', messages: [] }, labels)).toEqual({ text: '' })
  expect(statusText({ state: 'running', messages: [] }, labels).text).toBe('')
  expect(statusText({ state: 'stopping', messages: [] }, labels).text).toBe('')
  expect(
    statusText(
      {
        state: 'error',
        messages: [],
        error: { code: 'configuration', message: 'Configure a controller' }
      },
      labels
    )
  ).toEqual({ text: 'Configure a controller', tone: 'error' })
  expect(statusText({ state: 'error', messages: [] }, labels).tone).toBe('error')
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
  updateTranscript(list, messages, 'Helper', labels)
  expect(list.children[0].querySelector('summary')!.textContent).toBe('read_counter')
  expect(list.children[0].querySelector('details')!.open).toBe(false)
  expect(list.children[0].getAttribute('part')).toBe('message message-tool')
  expect(list.children[1].querySelector('strong')!.textContent).toBe('Helper — response failed')
  expect(list.children[1].querySelector('.body')!.textContent).toContain('Check application state')
  expect(list.children[1].querySelector('pre')!.textContent).toBe(messages[1].text)
  expect(list.querySelector('script')).toBeNull()
  expect(statusText({ state: 'idle', messages }, labels)).toEqual({
    text: expect.stringContaining('last response failed'),
    tone: 'error'
  })
  updateTranscript(
    list,
    [{ id: 'answer', role: 'assistant', text: 'Successful answer' }],
    'Helper',
    labels
  )
  expect(list.querySelector('details')).toBeNull()
  expect(list.querySelector('strong')!.textContent).toBe('Helper')
  expect(list.querySelector('li')!.getAttribute('part')).toBe('message message-assistant')
})

it('labels tool outcomes and shows structured input and output as inert code', function tools() {
  const list = document.createElement('ol')
  updateTranscript(
    list,
    [
      {
        id: 'done',
        role: 'tool',
        toolName: 'set_counter',
        text: 'Counter: 7',
        status: 'success',
        input: { value: 7 },
        output: { value: '<b>7</b>' }
      },
      { id: 'failed', role: 'tool', toolName: 'save', text: 'Denied', status: 'blocked' },
      { id: 'unknown', role: 'tool', toolName: 'pay', text: 'Interrupted', status: 'unknown' }
    ],
    'Assistant',
    labels
  )
  const [done, failed, unknown] = Array.from(list.children)
  expect(done.querySelector('summary')!.textContent).toBe('set_counter')
  expect(failed.querySelector('summary')!.textContent).toBe('save — failed')
  expect(unknown.querySelector('summary')!.textContent).toBe('pay — outcome unknown')
  const headings = Array.from(done.querySelectorAll('.tool-heading'), function text(node) {
    return node.textContent
  })
  expect(headings).toEqual(['Input', 'Output'])
  const code = done.querySelectorAll('pre code')
  expect(code[0].textContent).toBe('{\n  "value": 7\n}')
  expect(code[1].textContent).toBe('{\n  "value": "<b>7</b>"\n}')
  expect(done.querySelector('b')).toBeNull()
  expect(failed.querySelector('.tool-heading')!.textContent).toBe('Result')
  expect(failed.querySelector('code')!.textContent).toBe('Denied')
})

it('calls a custom message renderer only when message text changes', function custom() {
  const list = document.createElement('ol')
  const renderMessage = vi.fn(function render(message: { role: string }, target: HTMLElement) {
    if (message.role !== 'assistant') return
    const mark = document.createElement('mark')
    mark.textContent = 'custom'
    target.replaceChildren(mark)
    return true
  })
  const messages = [
    { id: 'question', role: 'user' as const, text: 'Hello' },
    { id: 'answer', role: 'assistant' as const, text: 'Hi' }
  ]
  updateTranscript(list, messages, 'Assistant', labels, renderMessage)
  expect(renderMessage).toHaveBeenCalledTimes(2)
  expect(list.children[0].querySelector('.body')!.textContent).toBe('Hello')
  expect(list.children[1].querySelector('mark')!.textContent).toBe('custom')
  expect(list.children[1].querySelector('.body')!.hasAttribute('data-custom')).toBe(true)
  updateTranscript(list, messages, 'Assistant', createLabels({ user: 'Me' }), renderMessage)
  expect(renderMessage).toHaveBeenCalledTimes(2)
  expect(list.children[0].querySelector('strong')!.textContent).toBe('Me')
  updateTranscript(
    list,
    [messages[0], { ...messages[1], text: 'Hi again' }],
    'Assistant',
    labels,
    renderMessage
  )
  expect(renderMessage).toHaveBeenCalledTimes(3)
})

it('describes the current activity', function activity() {
  expect(activityText(undefined, labels)).toBe('Working…')
  expect(activityText({ kind: 'resolving' }, labels)).toBe('Thinking…')
  expect(activityText({ kind: 'compacting' }, labels)).toBe('Summarizing earlier conversation…')
  expect(activityText({ kind: 'tool', toolName: 'read', phase: 'running' }, labels)).toBe(
    'Running read…'
  )
  expect(activityText({ kind: 'tool', toolName: 'save', phase: 'approval' }, labels)).toBe(
    'Waiting for your approval: save'
  )
})

it('formats limits with the configured locale and keeps unspecified labels', function locale() {
  const german = createLabels(
    {
      toolFailed(name) {
        return `${name} fehlgeschlagen`
      }
    },
    'de-DE'
  )
  expect(german.characterCount(14500, 16000)).toBe('14.500 / 16.000 characters')
  expect(german.toolFailed('save')).toBe('save fehlgeschlagen')
  expect(german.status.loading).toBe('Loading conversation…')
})
