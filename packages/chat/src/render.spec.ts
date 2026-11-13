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
  expect(list.children[0].querySelector('summary .visually-hidden')!.textContent).toBe(
    'read_counter'
  )
  expect(list.children[0].querySelector<HTMLElement>('.tools-summary')!.hidden).toBe(true)
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
  expect(list.children.length).toBe(1)
  const group = list.children[0] as HTMLElement
  expect(group.dataset.layout).toBe('tools')
  expect(group.querySelector('.tools-summary')!.textContent).toBe('Used 3 tools')
  const [done, failed, unknown] = Array.from(group.querySelectorAll<HTMLElement>('.tool-call'))
  function label(row: Element) {
    return row.querySelector('summary .visually-hidden')!.textContent
  }
  expect(label(done)).toBe('set_counter')
  expect(label(failed)).toBe('save — failed')
  expect(label(unknown)).toBe('pay — outcome unknown')
  expect([done, failed, unknown].map((row) => row.dataset.status)).toEqual([
    'success',
    'failed',
    'unknown'
  ])
  expect(done.querySelector('.tool-args')!.textContent).toBe('value: 7')
  expect(done.querySelector<HTMLElement>('.tool-outcome')!.hidden).toBe(true)
  expect(failed.querySelector<HTMLElement>('.tool-args')!.hidden).toBe(true)
  expect(failed.querySelector('.tool-outcome')!.textContent).toBe('Failed')
  expect(unknown.querySelector('.tool-outcome')!.textContent).toBe('Outcome unknown')
  const headings = Array.from(done.querySelectorAll('.tool-heading'), function text(node) {
    return node.textContent
  })
  expect(headings).toEqual(['Input', 'Output'])
  const code = done.querySelectorAll('pre code')
  expect(code[0].textContent).toBe('{\n  "value": 7\n}')
  expect(code[1].textContent).toBe('{\n  "value": "<b>7</b>"\n}')
  expect(done.querySelector('b')).toBeNull()
  expect(failed.querySelector('.tool-heading')!.textContent).toBe('Result')
  expect(failed.querySelector('.tool-section code')!.textContent).toBe('Denied')
})

it('groups only consecutive tool calls and keeps rows when a group grows', function grouping() {
  const list = document.createElement('ol')
  const first = { id: 'a', role: 'tool' as const, toolName: 'read', text: 'one' }
  const messages = [
    { id: 'question', role: 'user' as const, text: 'Go' },
    first,
    { id: 'answer', role: 'assistant' as const, text: 'Done' },
    { id: 'b', role: 'tool' as const, toolName: 'write', text: 'two' }
  ]
  updateTranscript(list, messages, 'Assistant', labels)
  expect(Array.from(list.children, (node) => (node as HTMLElement).dataset.layout)).toEqual([
    'message',
    'tools',
    'message',
    'tools'
  ])
  const row = list.querySelector('.tool-call')!
  updateTranscript(
    list,
    [messages[0], first, { id: 'c', role: 'tool', toolName: 'save', text: 'three' }],
    'Assistant',
    labels
  )
  expect(list.children.length).toBe(2)
  expect(list.querySelector('.tool-call')).toBe(row)
  expect(list.querySelectorAll('.tool-call').length).toBe(2)
})

it('hides role labels visually and offers copy only on assistant replies', function labelsAndCopy() {
  const list = document.createElement('ol')
  updateTranscript(
    list,
    [
      { id: 'question', role: 'user', text: 'Hello' },
      { id: 'answer', role: 'assistant', text: 'Hi' }
    ],
    'Assistant',
    labels
  )
  const [question, answer] = Array.from(list.children)
  expect(question.querySelector('strong')!.textContent).toBe('You')
  expect(question.querySelector('[data-copy]')).toBeNull()
  expect(answer.querySelector('[data-copy]')!.getAttribute('aria-label')).toBe('Copy reply')
})

it('truncates long argument previews', function preview() {
  const list = document.createElement('ol')
  updateTranscript(
    list,
    [{ id: 't', role: 'tool', toolName: 'save', text: '', input: { text: 'x'.repeat(400) } }],
    'Assistant',
    labels
  )
  const text = list.querySelector('.tool-args')!.textContent!
  expect(text.length).toBe(120)
  expect(text.endsWith('…')).toBe(true)
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
