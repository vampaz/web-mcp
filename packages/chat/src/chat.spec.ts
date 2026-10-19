import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PiController, PiSnapshot, PiTurnOutcome } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat } from './chat'
import type { WebMCPChatElement } from './interfaces/chat'

defineWebMCPChat()
beforeEach(function layout() {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
  )
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
    harness: api,
    title: 'Test assistant',
    suggestedPrompts: ['Read the counter']
  })
  document.body.append(element)
  const dialog = element.shadowRoot!.querySelector('dialog')!
  // jsdom does not implement dialogs; native focus and Escape are covered in browser tests.
  dialog.showModal = function showModal() {
    this.open = true
  }
  dialog.close = function close() {
    this.open = false
  }
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
  element.configure({ harness: fixture.api, mode: 'popup', title: 'Ask this page' })
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
  element.configure({ harness: fixture.api, mode: 'inline' })
  expect(panel.hidden).toBe(false)
  expect(panel.hasAttribute('role')).toBe(false)
  expect(launcher.hidden).toBe(true)
  expect(input.value).toBe('Unsent question')
  expect(element.shadowRoot!.querySelector('li')).toBe(message)
  expect(fixture.listeners.size).toBe(1)
  expect(fixture.api.stop).not.toHaveBeenCalled()
  expect(fixture.api.destroy).not.toHaveBeenCalled()
})

it('removes popup observers and listeners on disconnect and reconnects closed', function lifecycle() {
  const fixture = controller()
  const element = mount(fixture.api)
  const presentation = element.shadowRoot!.querySelector<HTMLElement>('.presentation')!
  const remove = vi.spyOn(window, 'removeEventListener')
  element.configure({ harness: fixture.api, mode: 'popup' })
  element.shadowRoot!.querySelector<HTMLButtonElement>('.launcher')!.click()
  element.remove()
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
  element.configure({ harness: second.api, title: 'Replacement', disabled: true })
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
    if (change === 'new controller') element.configure({ harness: controller().api })
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
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-confirm-clear]')!.click()
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
    error: { code: 'limit_reached', message: 'Clear chat before continuing.' }
  })
  const clear = element.shadowRoot!.querySelector<HTMLButtonElement>('[data-clear]')!
  expect(clear.disabled).toBe(false)
  clear.click()
  expect(fixture.api.clear).not.toHaveBeenCalled()
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-confirm-clear]')!.click()
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
  element.configure({ harness: fixture.api, title: 'Updated title' })
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
  expect(status.textContent).toBe('Ready')
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

it('cancels a stale clear confirmation when the controller changes', function test() {
  const first = controller()
  first.publish({ state: 'idle', messages: [{ id: 'a', role: 'user', text: 'Keep me' }] })
  const element = mount(first.api)
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-clear]')!.click()
  const dialog = element.shadowRoot!.querySelector('dialog')!
  expect(dialog.open).toBe(true)
  const second = controller()
  element.configure({ harness: second.api })
  expect(dialog.open).toBe(false)
  expect(first.api.clear).not.toHaveBeenCalled()
  expect(second.api.clear).not.toHaveBeenCalled()
})
