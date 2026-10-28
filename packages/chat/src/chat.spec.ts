import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PiController, PiSnapshot, PiTurnOutcome } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat } from './chat'
import type { WebMCPChatElement } from './interfaces/chat'

defineWebMCPChat()
let coarsePointer = false
beforeEach(function layout() {
  coarsePointer = false
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal('matchMedia', function matchMedia(query: string) {
    return {
      get matches() {
        return query === '(pointer: coarse)' && coarsePointer
      }
    }
  })
})
afterEach(function cleanup() {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

function controller() {
  let snapshot: PiSnapshot = { state: 'idle', messages: [] }
  const listeners = new Set<(value: PiSnapshot) => void>()
  const api: PiController = {
    getSnapshot() {
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot)
      return function remove() {
        listeners.delete(listener)
      }
    },
    send: vi.fn(async function send() {
      return { status: 'completed' as const }
    }),
    stop: vi.fn(async function stop() {}),
    clear: vi.fn(async function clear() {}),
    refresh: vi.fn(async function refresh() {}),
    destroy: vi.fn(async function destroy() {})
  }
  return {
    api,
    listeners,
    publish(next: PiSnapshot) {
      snapshot = next
      for (const listener of listeners) listener(next)
    }
  }
}
function mount(api: PiController) {
  const element = document.createElement('webmcp-chat') as WebMCPChatElement
  element.configure({
    controller: api,
    title: 'Test assistant',
    suggestedPrompts: ['Read the counter']
  })
  document.body.append(element)
  const presentation = element.shadowRoot!.querySelector<HTMLElement>('.presentation')!
  presentation.showPopover = vi.fn()
  presentation.hidePopover = vi.fn()
  return element
}

it('switches presentation without replacing the controller, transcript, or draft', function popup() {
  const fixture = controller()
  const element = mount(fixture.api)
  fixture.publish({
    state: 'idle',
    messages: [{ id: 'a', role: 'assistant', text: 'Saved reply' }]
  })
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'Unsent question'
  const message = element.shadowRoot!.querySelector('li')!
  element.configure({ controller: fixture.api, mode: 'popup', title: 'Ask this page' })
  const launcher = element.shadowRoot!.querySelector<HTMLButtonElement>('.launcher')!
  const panel = element.shadowRoot!.querySelector('section')!
  expect(panel.getAttribute('role')).toBe('dialog')
  expect(panel.hidden).toBe(true)
  expect(launcher.getAttribute('aria-label')).toBe('Open Ask this page')
  launcher.click()
  expect(panel.hidden).toBe(false)
  expect(element.shadowRoot!.activeElement).toBe(input)
  panel.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })
  )
  expect(panel.hidden).toBe(false)
  panel.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
  expect(panel.hidden).toBe(true)
  expect(element.shadowRoot!.activeElement).toBe(launcher)
  launcher.click()
  element.configure({ controller: fixture.api, mode: 'inline' })
  expect(panel.hidden).toBe(false)
  expect(panel.hasAttribute('role')).toBe(false)
  expect(launcher.hidden).toBe(true)
  expect(input.value).toBe('Unsent question')
  expect(element.shadowRoot!.querySelector('li')).toBe(message)
  expect(fixture.listeners.size).toBe(1)
  expect(fixture.api.stop).not.toHaveBeenCalled()
  expect(fixture.api.destroy).not.toHaveBeenCalled()
})

it('removes popup observers and listeners on disconnect and reconnects closed', async function lifecycle() {
  const fixture = controller()
  const element = mount(fixture.api)
  const presentation = element.shadowRoot!.querySelector<HTMLElement>('.presentation')!
  const remove = vi.spyOn(window, 'removeEventListener')
  element.configure({ controller: fixture.api, mode: 'popup' })
  element.shadowRoot!.querySelector<HTMLButtonElement>('.launcher')!.click()
  element.remove()
  expect(presentation.hidePopover).not.toHaveBeenCalled()
  await Promise.resolve()
  expect(presentation.hidePopover).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  expect(fixture.listeners.size).toBe(0)
  document.body.append(element)
  expect(presentation.showPopover).toHaveBeenCalledTimes(2)
  expect(element.shadowRoot!.querySelector('section')!.hidden).toBe(true)
  expect(element.shadowRoot!.querySelector('.launcher')!.getAttribute('aria-expanded')).toBe(
    'false'
  )
  expect(fixture.listeners.size).toBe(1)
  remove.mockRestore()
})

it('uses a fake controller with no Pi runtime and keeps model text inert', function test() {
  const fixture = controller()
  const element = mount(fixture.api)
  fixture.publish({
    state: 'idle',
    messages: [{ id: 'a', role: 'assistant', text: '<img src=x onerror=alert(1)>' }]
  })
  expect(element.shadowRoot!.querySelector('img')).toBeNull()
  expect(element.shadowRoot!.querySelector('ol')!.textContent).toContain('<img')
  expect(element.shadowRoot!.textContent).not.toMatch(/API key|Provider settings|Model settings/)
  expect(fixture.api.destroy).not.toHaveBeenCalled()
})

it('sends on Enter, keeps Shift+Enter, and ignores composition', async function test() {
  const fixture = controller()
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'Hello'
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true })
  )
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true })
  )
  expect(fixture.api.send).not.toHaveBeenCalled()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
  expect(fixture.api.send).toHaveBeenCalledWith('Hello')
  await Promise.resolve()
})

it('disconnects subscriptions and replaces controllers without destroying either', function test() {
  const first = controller()
  const second = controller()
  const element = mount(first.api)
  first.publish({
    state: 'idle',
    messages: [{ id: 'shared', role: 'assistant', text: 'Previous account message' }]
  })
  second.publish({
    state: 'idle',
    messages: [{ id: 'shared', role: 'tool', toolName: 'read', text: 'New account result' }]
  })
  element.shadowRoot!.querySelector('textarea')!.value = 'Previous account draft'
  expect(first.listeners.size).toBe(1)
  element.configure({ controller: second.api, title: 'Replacement', disabled: true })
  expect(first.listeners.size).toBe(0)
  expect(element.shadowRoot!.querySelector('textarea')!.value).toBe('')
  expect(element.shadowRoot!.querySelector('details')!.open).toBe(false)
  expect(element.shadowRoot!.textContent).not.toContain('Previous account message')
  expect(second.listeners.size).toBe(1)
  expect(element.shadowRoot!.querySelector('textarea')!.disabled).toBe(true)
  element.remove()
  expect(second.listeners.size).toBe(0)
  document.body.append(element)
  expect(second.listeners.size).toBe(1)
  expect(first.api.destroy).not.toHaveBeenCalled()
})

it('keeps a rejected controller operation visible after rendering settles', async function test() {
  const fixture = controller()
  vi.mocked(fixture.api.send).mockRejectedValueOnce(new Error('Controller request failed'))
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'Hello'
  input.dispatchEvent(new Event('input'))
  element
    .shadowRoot!.querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.waitFor(function visible() {
    expect(element.shadowRoot!.querySelector('[role=status]')!.textContent).toBe(
      'Controller request failed'
    )
    expect(input.value).toBe('Hello')
  })
})

it('restores a rejected draft but does not duplicate a message already recorded', async function test() {
  const fixture = controller()
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  const error = {
    code: 'conversation_busy' as const,
    message: 'Another tab is using this conversation.'
  }
  vi.mocked(fixture.api.send).mockImplementationOnce(async function reject() {
    fixture.publish({ state: 'error', messages: [], error })
    return { status: 'error', error }
  })
  input.value = '  Keep this draft  '
  input.dispatchEvent(new Event('input'))
  element.shadowRoot!.querySelector<HTMLButtonElement>('[type=submit]')!.click()
  await vi.waitFor(function restored() {
    expect(input.value).toBe('  Keep this draft  ')
  })
  vi.mocked(fixture.api.send).mockImplementationOnce(async function accepted() {
    fixture.publish({
      state: 'error',
      messages: [{ id: 'new', role: 'user', text: 'Keep this draft' }],
      error
    })
    return { status: 'error', error }
  })
  element.shadowRoot!.querySelector<HTMLButtonElement>('[type=submit]')!.click()
  await Promise.resolve()
  expect(input.value).toBe('')
})

it.each(['new draft', 'new controller'])(
  'preserves a %s when an old send rejects',
  async function test(change) {
    const fixture = controller()
    let reject!: (error: Error) => void
    vi.mocked(fixture.api.send).mockReturnValueOnce(
      new Promise(function pending(_resolve, fail) {
        reject = fail
      })
    )
    const element = mount(fixture.api)
    const input = element.shadowRoot!.querySelector('textarea')!
    input.value = 'Old draft'
    input.dispatchEvent(new Event('input'))
    element.shadowRoot!.querySelector<HTMLButtonElement>('[type=submit]')!.click()
    if (change === 'new controller') element.configure({ controller: controller().api })
    input.value = 'New draft'
    reject(new Error('Old request failed'))
    await Promise.resolve()
    expect(input.value).toBe('New draft')
  }
)

it.each(['composer', 'outside', 'transcript'])(
  'respects focus in the %s when an answer finishes',
  async function test(target) {
    const fixture = controller()
    let complete!: (outcome: PiTurnOutcome) => void
    vi.mocked(fixture.api.send).mockImplementationOnce(function pending() {
      fixture.publish({ state: 'running', messages: [{ id: 'sent', role: 'user', text: 'Hello' }] })
      return new Promise(function wait(resolve) {
        complete = resolve
      })
    })
    const element = mount(fixture.api)
    const input = element.shadowRoot!.querySelector('textarea')!
    const outside = document.createElement('input')
    document.body.append(outside)
    input.value = 'Hello'
    input.dispatchEvent(new Event('input'))
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(element.shadowRoot!.activeElement).toBe(input)
    const destination =
      target === 'outside'
        ? outside
        : element.shadowRoot!.querySelector<HTMLElement>('.transcript')!
    if (target !== 'composer') destination.focus()
    fixture.publish({ state: 'idle', messages: fixture.api.getSnapshot().messages })
    complete({ status: 'completed' })
    await Promise.resolve()
    expect(target === 'outside' ? document.activeElement : element.shadowRoot!.activeElement).toBe(
      target === 'composer' ? input : destination
    )
  }
)

it('does not steal focus when a pending clear finishes', async function test() {
  const fixture = controller()
  let complete!: () => void
  vi.mocked(fixture.api.clear).mockReturnValueOnce(
    new Promise(function pending(resolve) {
      complete = resolve
    })
  )
  fixture.publish({ state: 'idle', messages: [{ id: 'a', role: 'user', text: 'Hello' }] })
  const element = mount(fixture.api)
  const outside = document.createElement('input')
  document.body.append(outside)
  const clear = element.shadowRoot!.querySelector<HTMLButtonElement>('[data-clear]')!
  clear.focus()
  clear.click()
  outside.focus()
  complete()
  await Promise.resolve()
  expect(document.activeElement).toBe(outside)
})

it('gives instances distinct control IDs and exposes stop and clear states', function test() {
  const fixture = controller()
  const first = mount(fixture.api)
  const second = mount(fixture.api)
  expect(first.shadowRoot!.querySelector('textarea')!.id).not.toBe(
    second.shadowRoot!.querySelector('textarea')!.id
  )
  fixture.publish({ state: 'running', messages: [{ id: 'a', role: 'user', text: 'Wait' }] })
  expect(first.shadowRoot!.querySelector<HTMLButtonElement>('[data-stop]')!.disabled).toBe(false)
  expect(first.shadowRoot!.querySelector<HTMLButtonElement>('[data-clear]')!.disabled).toBe(true)
  first.shadowRoot!.querySelector<HTMLButtonElement>('[data-stop]')!.click()
  expect(fixture.api.stop).toHaveBeenCalledTimes(1)
})

it('allows clearing an unreadable conversation even when no messages could load', function test() {
  const fixture = controller()
  const element = mount(fixture.api)
  fixture.publish({
    state: 'error',
    messages: [],
    error: { code: 'limit_reached', message: 'Start a new chat before continuing.' }
  })
  const clear = element.shadowRoot!.querySelector<HTMLButtonElement>('[data-clear]')!
  expect(clear.disabled).toBe(false)
  clear.click()
  expect(fixture.api.clear).toHaveBeenCalledTimes(1)
})

it.each([0, 100])(
  'updates drafts without rereading or mutating a transcript of %i messages',
  function drafting(count) {
    const fixture = controller()
    const messages: PiSnapshot['messages'] = Array.from({ length: count }, function message(_, id) {
      return { id: String(id), role: 'assistant', text: `Saved reply ${id}` }
    })
    fixture.publish({ state: 'idle', messages })
    const element = mount(fixture.api)
    const input = element.shadowRoot!.querySelector('textarea')!
    const send = element.shadowRoot!.querySelector<HTMLButtonElement>('[type=submit]')!
    const read = vi.spyOn(fixture.api, 'getSnapshot')
    const observer = new MutationObserver(function changed() {})
    observer.observe(element.shadowRoot!.querySelector('ol')!, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true
    })

    function draft(text: string) {
      read.mockClear()
      observer.takeRecords()
      input.value = text
      input.dispatchEvent(new Event('input'))
      expect(read).not.toHaveBeenCalled()
      expect(observer.takeRecords()).toEqual([])
    }

    draft('Next question')
    expect(send.disabled).toBe(false)
    fixture.publish({ state: 'running', messages })
    draft('Draft while waiting')
    expect(send.disabled).toBe(true)
    fixture.publish({ state: 'idle', messages })
    draft('Ready to send')
    expect(send.disabled).toBe(false)
    draft(' ')
    expect(send.disabled).toBe(true)
    observer.disconnect()
    read.mockRestore()
  }
)

it('hides suggestions while drafting and retains oversized input with an explanation', function test() {
  const fixture = controller()
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  const suggestions = element.shadowRoot!.querySelector<HTMLElement>('.suggestions')!
  expect(suggestions.hidden).toBe(false)
  suggestions.querySelector('button')!.click()
  expect(input.value).toBe('Read the counter')
  expect(suggestions.hidden).toBe(true)
  expect(element.shadowRoot!.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(
    false
  )
  input.value = 'My unfinished request'
  input.dispatchEvent(new Event('input'))
  expect(suggestions.hidden).toBe(true)
  expect(input.hasAttribute('maxlength')).toBe(false)
  input.value = 'x'.repeat(16050)
  input.dispatchEvent(new Event('input'))
  expect(input.value).toHaveLength(16050)
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(element.shadowRoot!.querySelector('.limit')!.textContent).toContain('Shorten your message')
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
  expect(fixture.api.send).not.toHaveBeenCalled()
  input.value = ''
  input.dispatchEvent(new Event('input'))
  expect(suggestions.hidden).toBe(false)
  expect(input.getAttribute('aria-invalid')).toBe('false')
})

it('keeps the composer usable without submitting a second turn while waiting', async function test() {
  const fixture = controller()
  let complete!: (outcome: PiTurnOutcome) => void
  vi.mocked(fixture.api.send).mockReturnValueOnce(
    new Promise(function pending(resolve) {
      complete = resolve
    })
  )
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'First message'
  input.dispatchEvent(new Event('input'))
  input.focus()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
  expect(input.disabled).toBe(false)
  expect(element.shadowRoot!.activeElement).toBe(input)
  expect(element.shadowRoot!.querySelector('[role=status]')!.textContent).toBe('')
  expect(element.shadowRoot!.querySelector<HTMLElement>('.working')!.hidden).toBe(false)
  expect(element.shadowRoot!.querySelector<HTMLElement>('.suggestions')!.hidden).toBe(true)
  element.configure({ controller: fixture.api, title: 'Updated title' })
  input.value = 'Follow-up draft'
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
  expect(fixture.api.send).toHaveBeenCalledTimes(1)
  complete({ status: 'completed' })
  await Promise.resolve()
  expect(input.value).toBe('Follow-up draft')
  expect(element.shadowRoot!.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(
    false
  )
})

it('keeps suggestions outside message announcements when the draft is cleared', function announcements() {
  const fixture = controller()
  const element = mount(fixture.api)
  const root = element.shadowRoot!
  const log = root.querySelector('[role=log]')!
  const suggestion = root.querySelector<HTMLButtonElement>('.suggestions button')!
  expect(log.contains(suggestion)).toBe(false)
  suggestion.click()
  expect(root.querySelector('textarea')!.value).toBe('Read the counter')
  element.setDraft('')
  expect(root.querySelector<HTMLElement>('.suggestions')!.hidden).toBe(false)
  expect(log.contains(suggestion)).toBe(false)
  fixture.publish({
    state: 'idle',
    messages: [{ id: 'reply', role: 'assistant', text: 'Counter: 7' }]
  })
  expect(log.textContent).toContain('Counter: 7')
  expect(log.getAttribute('aria-label')).toBe('Conversation')
})

it('shows the working indicator in the transcript instead of the status region', async function test() {
  const fixture = controller()
  let complete!: (outcome: PiTurnOutcome) => void
  vi.mocked(fixture.api.send).mockReturnValueOnce(
    new Promise(function pending(resolve) {
      complete = resolve
    })
  )
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  const working = element.shadowRoot!.querySelector<HTMLElement>('.working')!
  const status = element.shadowRoot!.querySelector('[role=status]')!
  expect(working.hidden).toBe(true)
  input.value = 'Hello'
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
  expect(working.hidden).toBe(false)
  expect(working.closest('ol')).toBeNull()
  expect(status.textContent).toBe('')
  fixture.publish({ state: 'running', messages: [{ id: 'sent', role: 'user', text: 'Hello' }] })
  expect(working.hidden).toBe(false)
  expect(status.textContent).toBe('')
  expect(element.shadowRoot!.querySelector('ol')!.textContent).not.toContain('Working')
  fixture.publish({ state: 'stopping', messages: [{ id: 'sent', role: 'user', text: 'Hello' }] })
  expect(working.hidden).toBe(false)
  fixture.publish({ state: 'idle', messages: fixture.api.getSnapshot().messages })
  complete({ status: 'completed' })
  await Promise.resolve()
  expect(working.hidden).toBe(true)
  expect(status.textContent).toBe('')
  expect(status.hasAttribute('data-tone')).toBe(false)
})

it('hides the working indicator when a turn ends before send settles', async function test() {
  const fixture = controller()
  let complete!: (outcome: PiTurnOutcome) => void
  vi.mocked(fixture.api.send).mockReturnValueOnce(
    new Promise(function pending(resolve) {
      complete = resolve
    })
  )
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'Hello'
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
  expect(element.shadowRoot!.querySelector<HTMLElement>('.working')!.hidden).toBe(false)
  fixture.publish({ state: 'interrupted', messages: [] })
  expect(element.shadowRoot!.querySelector<HTMLElement>('.working')!.hidden).toBe(true)
  expect(element.shadowRoot!.querySelector('[role=status]')!.textContent).toContain('interrupted')
  complete({ status: 'interrupted' })
  await Promise.resolve()
})

it('does not change a new controller when a previous chat reset finishes', async function staleReset() {
  const first = controller()
  let complete!: () => void
  vi.mocked(first.api.clear).mockReturnValueOnce(
    new Promise(function pending(resolve) {
      complete = resolve
    })
  )
  first.publish({ state: 'idle', messages: [{ id: 'a', role: 'user', text: 'Keep me' }] })
  const element = mount(first.api)
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-clear]')!.click()
  const second = controller()
  element.configure({ controller: second.api })
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'Draft in the new controller'
  complete()
  await Promise.resolve()
  expect(input.value).toBe('Draft in the new controller')
  expect(first.api.clear).toHaveBeenCalledOnce()
  expect(second.api.clear).not.toHaveBeenCalled()
})

it('starts an empty new chat without confirmation and resets its draft only after persistence succeeds', async function newChat() {
  const fixture = controller()
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'Unsent draft'
  input.dispatchEvent(new Event('input'))
  const button = element.shadowRoot!.querySelector<HTMLButtonElement>('[data-clear]')!
  expect(button.getAttribute('aria-label')).toBe('New chat')
  expect(button.disabled).toBe(false)
  expect(element.shadowRoot!.querySelector('dialog')).toBeNull()
  let complete!: () => void
  vi.mocked(fixture.api.clear).mockReturnValueOnce(
    new Promise(function pending(resolve) {
      complete = resolve
    })
  )
  button.click()
  expect(fixture.api.clear).toHaveBeenCalledOnce()
  expect(input.value).toBe('Unsent draft')
  expect(input.disabled).toBe(true)
  expect(button.disabled).toBe(true)
  complete()
  await Promise.resolve()
  expect(input.value).toBe('')
  expect(input.disabled).toBe(false)
  expect(element.shadowRoot!.querySelector('[role=status]')!.textContent).toBe('New chat started.')
  expect(element.shadowRoot!.activeElement).toBe(input)
})

it('keeps history and the draft when starting a new chat fails', async function failedReset() {
  const fixture = controller()
  fixture.publish({ state: 'idle', messages: [{ id: 'a', role: 'user', text: 'Saved message' }] })
  vi.mocked(fixture.api.clear).mockRejectedValueOnce(new Error('Storage is unavailable'))
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'Keep this draft'
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-clear]')!.click()
  await Promise.resolve()
  expect(input.value).toBe('Keep this draft')
  expect(input.disabled).toBe(false)
  expect(element.shadowRoot!.querySelector('ol')!.textContent).toContain('Saved message')
  const status = element.shadowRoot!.querySelector<HTMLElement>('[role=status]')!
  expect(status.textContent).toBe('Storage is unavailable')
  expect(status.dataset.tone).toBe('error')
  input.value = 'Keep this draft, edited'
  input.dispatchEvent(new Event('input'))
  expect(status.textContent).toBe('Storage is unavailable')
})

it.each(['inline', 'popup'] as const)(
  'starts a new chat immediately with existing history in %s mode',
  async function immediateNewChat(mode) {
    const fixture = controller()
    fixture.publish({ state: 'idle', messages: [{ id: 'a', role: 'user', text: 'Saved message' }] })
    vi.mocked(fixture.api.clear).mockImplementationOnce(async function clear() {
      fixture.publish({ state: 'idle', messages: [] })
    })
    const element = mount(fixture.api)
    element.configure({ controller: fixture.api, mode })
    if (mode === 'popup') element.open()
    element.setDraft('Unsent draft')
    const root = element.shadowRoot!
    root.querySelector<HTMLButtonElement>('[data-clear]')!.click()
    expect(fixture.api.clear).toHaveBeenCalledOnce()
    expect(root.querySelector('[data-confirm-clear]')).toBeNull()
    expect(root.querySelector('[data-cancel-clear]')).toBeNull()
    await Promise.resolve()
    expect(root.querySelector('ol')!.children).toHaveLength(0)
    expect(root.querySelector('textarea')!.value).toBe('')
    expect(root.querySelector('[role=status]')!.textContent).toBe('New chat started.')
    expect(root.activeElement).toBe(root.querySelector('textarea'))
    expect(root.querySelector('section')!.hidden).toBe(false)
    fixture.publish({ state: 'idle', messages: [{ id: 'b', role: 'user', text: 'Another tab' }] })
    expect(root.querySelector('[role=status]')!.textContent).toBe('')
  }
)

it('shows errors with an error tone and stays quiet after a successful turn', function tone() {
  const fixture = controller()
  const element = mount(fixture.api)
  const status = element.shadowRoot!.querySelector<HTMLElement>('[role=status]')!
  expect(status.textContent).toBe('')
  fixture.publish({
    state: 'error',
    messages: [],
    error: { code: 'provider_failed', message: 'Provider failed' }
  })
  expect(status.textContent).toBe('Provider failed')
  expect(status.dataset.tone).toBe('error')
  fixture.publish({ state: 'interrupted', messages: [] })
  expect(status.textContent).toContain('interrupted')
  expect(status.hasAttribute('data-tone')).toBe(false)
  fixture.publish({ state: 'idle', messages: [{ id: 'a', role: 'assistant', text: 'Done' }] })
  expect(status.textContent).toBe('')
  expect(status.hasAttribute('data-tone')).toBe(false)
})

it.each([{ state: 'interrupted' as const }, { state: 'idle' as const, failed: true }])(
  'offers to edit the last message after a $state turn without resending',
  function edit(case_) {
    const fixture = controller()
    const element = mount(fixture.api)
    const root = element.shadowRoot!
    const input = root.querySelector('textarea')!
    const edit = root.querySelector<HTMLButtonElement>('[data-edit-last]')!
    fixture.publish({
      state: 'idle',
      messages: [
        { id: 'q', role: 'user', text: 'Set the counter to 7' },
        { id: 'a', role: 'assistant', text: 'Done' }
      ]
    })
    expect(edit.hidden).toBe(true)
    fixture.publish({
      state: case_.state,
      messages: [
        { id: 'q', role: 'user', text: 'Set the counter to 7' },
        { id: 'a', role: 'assistant', text: 'Done' },
        { id: 'q2', role: 'user', text: 'Now set it to 9' },
        { id: 'a2', role: 'assistant', text: 'HTTP 503', failed: case_.failed }
      ]
    })
    expect(edit.hidden).toBe(false)
    expect(edit.textContent).toBe('Edit last message')
    edit.click()
    expect(input.value).toBe('Now set it to 9')
    expect(root.activeElement).toBe(input)
    expect(edit.hidden).toBe(true)
    expect(fixture.api.send).not.toHaveBeenCalled()
  }
)

it('renders and announces activity changes once', function activity() {
  const fixture = controller()
  const element = mount(fixture.api)
  const root = element.shadowRoot!
  const working = root.querySelector<HTMLElement>('.working')!
  const announcer = root.querySelector<HTMLElement>('[data-activity]')!
  const messages = [{ id: 'q', role: 'user' as const, text: 'Set the counter' }]
  const announcements: string[] = []
  const observer = new MutationObserver(function changed() {})
  observer.observe(announcer, { childList: true, characterData: true, subtree: true })
  function publish(snapshot: PiSnapshot) {
    fixture.publish(snapshot)
    if (observer.takeRecords().length) announcements.push(announcer.textContent!)
  }
  publish({ state: 'running', messages, activity: { kind: 'resolving' } })
  expect(working.textContent).toBe('Thinking…')
  expect(working.getAttribute('aria-hidden')).toBe('true')
  publish({ state: 'running', messages, activity: { kind: 'resolving' } })
  publish({
    state: 'running',
    messages,
    activity: { kind: 'tool', toolName: 'set_counter', phase: 'approval' }
  })
  publish({
    state: 'running',
    messages,
    activity: { kind: 'tool', toolName: 'set_counter', phase: 'running' }
  })
  publish({ state: 'running', messages, activity: { kind: 'compacting' } })
  publish({ state: 'idle', messages })
  observer.disconnect()
  expect(announcements).toEqual([
    'Thinking…',
    'Waiting for your approval: set_counter',
    'Running set_counter…',
    'Summarizing earlier conversation…',
    ''
  ])
  expect(working.hidden).toBe(true)
})

it('uses subscribed snapshots without rereading the controller', function snapshots() {
  const fixture = controller()
  mount(fixture.api)
  const read = vi.spyOn(fixture.api, 'getSnapshot')
  fixture.publish({ state: 'running', messages: [{ id: 'q', role: 'user', text: 'Hi' }] })
  fixture.publish({
    state: 'idle',
    messages: [
      { id: 'q', role: 'user', text: 'Hi' },
      { id: 'a', role: 'assistant', text: 'Hello' }
    ]
  })
  expect(read).not.toHaveBeenCalled()
  read.mockRestore()
})

it('exposes popup controls, draft helpers, and events', async function api() {
  const fixture = controller()
  const element = mount(fixture.api)
  const root = element.shadowRoot!
  const input = root.querySelector('textarea')!
  const toggles: boolean[] = []
  const sent: string[] = []
  document.addEventListener('webmcp-chat-toggle', function toggled(event) {
    toggles.push((event as CustomEvent<{ open: boolean }>).detail.open)
  })
  document.addEventListener('webmcp-chat-send', function sentText(event) {
    sent.push((event as CustomEvent<{ text: string }>).detail.text)
  })
  element.open()
  expect(toggles).toEqual([])
  element.configure({ controller: fixture.api, mode: 'popup' })
  const panel = root.querySelector('section')!
  element.open()
  expect(panel.hidden).toBe(false)
  expect(root.activeElement).toBe(input)
  element.open()
  element.toggle()
  expect(panel.hidden).toBe(true)
  element.focusComposer()
  expect(panel.hidden).toBe(false)
  expect(root.activeElement).toBe(input)
  element.close()
  expect(toggles).toEqual([true, false, true, false])
  element.setDraft('Drafted by the page')
  expect(input.value).toBe('Drafted by the page')
  expect(root.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(false)
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  expect(sent).toEqual(['Drafted by the page'])
  expect(fixture.api.send).toHaveBeenCalledWith('Drafted by the page')
  await Promise.resolve()
  const next = controller()
  element.controller = next.api
  expect(element.controller).toBe(next.api)
  expect(fixture.listeners.size).toBe(0)
  expect(next.listeners.size).toBe(1)
  expect(panel.getAttribute('role')).toBe('dialog')
})

it('keeps an open popup open when the element moves in the document', async function move() {
  const fixture = controller()
  const element = mount(fixture.api)
  const presentation = element.shadowRoot!.querySelector<HTMLElement>('.presentation')!
  element.configure({ controller: fixture.api, mode: 'popup' })
  element.open()
  const target = document.createElement('div')
  document.body.append(target)
  target.append(element)
  await Promise.resolve()
  expect(presentation.hidePopover).not.toHaveBeenCalled()
  expect(presentation.showPopover).toHaveBeenCalledTimes(2)
  expect(element.shadowRoot!.querySelector('section')!.hidden).toBe(false)
  expect(element.shadowRoot!.querySelector('.launcher')!.getAttribute('aria-expanded')).toBe('true')
  expect(fixture.listeners.size).toBe(1)
})

it('inserts new lines with Enter on touch pointers and describes only visible help', function touch() {
  coarsePointer = true
  const fixture = controller()
  const element = mount(fixture.api)
  const input = element.shadowRoot!.querySelector('textarea')!
  input.value = 'Hello'
  input.dispatchEvent(new Event('input'))
  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
  input.dispatchEvent(enter)
  expect(enter.defaultPrevented).toBe(false)
  expect(fixture.api.send).not.toHaveBeenCalled()
  expect(input.getAttribute('enterkeyhint')).toBe('enter')
  expect(input.hasAttribute('aria-describedby')).toBe(false)
  coarsePointer = false
  input.value = 'x'.repeat(15000)
  input.dispatchEvent(new Event('input'))
  const hint = element.shadowRoot!.querySelector('.hint')!.id
  const limit = element.shadowRoot!.querySelector('.limit')!
  expect(input.getAttribute('enterkeyhint')).toBe('send')
  expect(input.getAttribute('aria-describedby')).toBe(`${hint} ${limit.id}`)
  input.value = 'short'
  input.dispatchEvent(new Event('input'))
  expect(input.getAttribute('aria-describedby')).toBe(hint)
})

it('applies labels, locale formatting, message limits, theme, and parts', function labels() {
  const fixture = controller()
  const element = mount(fixture.api)
  element.configure({
    controller: fixture.api,
    labels: {
      newChat: 'Nova conversa',
      send: 'Enviar',
      characterCount(count, max) {
        return `${count}/${max}`
      }
    },
    locale: 'de-DE',
    maxMessageLength: 20,
    theme: 'dark'
  })
  const root = element.shadowRoot!
  const input = root.querySelector('textarea')!
  expect(root.querySelector('[data-clear]')!.getAttribute('aria-label')).toBe('Nova conversa')
  expect(root.querySelector('[type=submit]')!.getAttribute('aria-label')).toBe('Enviar')
  input.value = 'x'.repeat(19)
  input.dispatchEvent(new Event('input'))
  expect(root.querySelector('.limit')!.textContent).toBe('19/20')
  input.value = 'x'.repeat(21)
  input.dispatchEvent(new Event('input'))
  expect(root.querySelector('.limit')!.textContent).toContain('21 / 20 characters')
  expect(root.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(true)
  element.configure({ controller: fixture.api, locale: 'de-DE', suggestedPrompts: ['Read'] })
  input.value = 'x'.repeat(15000)
  input.dispatchEvent(new Event('input'))
  expect(root.querySelector('.limit')!.textContent).toBe('15.000 / 16.000 characters')
  expect(element.dataset.theme).toBe('light')
  const parts = [
    'panel',
    'header',
    'title',
    'launcher',
    'transcript',
    'composer',
    'textarea',
    'send',
    'stop',
    'new-chat',
    'suggestion',
    'status',
    'jump-latest'
  ]
  expect(
    parts.filter(function missing(part) {
      return !root.querySelector(`[part~="${part}"]`)
    })
  ).toEqual([])
  expect(
    ['header-actions', 'footer', 'empty'].filter(function missing(slot) {
      return !root.querySelector(`slot[name="${slot}"]`)
    })
  ).toEqual([])
})

it('lets a custom renderer own message bodies', function customRenderer() {
  const fixture = controller()
  const element = mount(fixture.api)
  element.configure({
    controller: fixture.api,
    renderMessage(message, target) {
      const emphasis = document.createElement('em')
      emphasis.textContent = message.text.toUpperCase()
      target.replaceChildren(emphasis)
      return true
    }
  })
  fixture.publish({ state: 'idle', messages: [{ id: 'a', role: 'assistant', text: 'hello' }] })
  expect(element.shadowRoot!.querySelector('li em')!.textContent).toBe('HELLO')
})

it.each([
  { direction: 'ltr', grow: 'ArrowRight', shrink: 'ArrowLeft' },
  { direction: 'rtl', grow: 'ArrowLeft', shrink: 'ArrowRight' }
])('resizes the popup toward the inline end in $direction', function rtl(case_) {
  const fixture = controller()
  const element = mount(fixture.api)
  element.style.direction = case_.direction
  element.configure({ controller: fixture.api, mode: 'popup' })
  element.open()
  const panel = element.shadowRoot!.querySelector('section')!
  const resize = element.shadowRoot!.querySelector<HTMLButtonElement>('[data-resize]')!
  resize.dispatchEvent(new KeyboardEvent('keydown', { key: case_.grow, cancelable: true }))
  expect(panel.style.width).toBe('10px')
  resize.dispatchEvent(new KeyboardEvent('keydown', { key: case_.shrink, cancelable: true }))
  expect(panel.style.width).toBe('0px')
})

it('describes only the move and resize controls with popup instructions', function instructions() {
  const fixture = controller()
  const element = mount(fixture.api)
  element.configure({ controller: fixture.api, mode: 'popup', title: 'Helper' })
  const root = element.shadowRoot!
  const launcher = root.querySelector('.launcher')!
  expect(launcher.getAttribute('aria-label')).toBe('Open Helper')
  expect(launcher.hasAttribute('aria-describedby')).toBe(false)
  element.open()
  expect(launcher.getAttribute('aria-label')).toBe('Open Helper')
  expect(launcher.getAttribute('aria-expanded')).toBe('true')
  for (const name of ['Move chat', 'Resize chat']) {
    const control = root.querySelector(`[aria-label="${name}"]`)!
    const help = root.getElementById(control.getAttribute('aria-describedby')!)!
    expect(help.textContent).toMatch(/arrow keys/i)
  }
})

it('returns focus to the launcher when the user closes even if the click did not focus', function closeFocus() {
  const fixture = controller()
  const element = mount(fixture.api)
  element.configure({ controller: fixture.api, mode: 'popup' })
  const launcher = element.shadowRoot!.querySelector<HTMLButtonElement>('.launcher')!
  const close = element.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close chat"]')!
  launcher.click()
  // WebKit does not focus a clicked button, so focus is outside the chat when Close runs.
  ;(element.shadowRoot!.activeElement as HTMLElement | null)?.blur()
  close.click()
  expect(element.shadowRoot!.activeElement).toBe(launcher)

  launcher.click()
  ;(element.shadowRoot!.activeElement as HTMLElement | null)?.blur()
  const outside = document.createElement('button')
  document.body.append(outside)
  outside.focus()
  element.close()
  expect(document.activeElement).toBe(outside)
  outside.remove()
})
