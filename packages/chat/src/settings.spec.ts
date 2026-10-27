import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PiController, PiSnapshot } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat } from './chat'
import type { WebMCPChatSettings } from './interfaces/settings'
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

function settings(): WebMCPChatSettings {
  return {
    providers: [
      { id: 'first', label: 'First provider', models: [{ model: 'one', label: 'Model one' }] },
      {
        id: 'second',
        label: 'Second provider',
        models: [
          { model: 'two', label: 'Model two' },
          { model: 'three', label: 'Model three' }
        ]
      },
      { id: 'built-in', label: 'Built-in', models: [] }
    ],
    providerId: 'first',
    model: 'one',
    onChange: vi.fn(),
    confirmations: { enabled: true, onChange: vi.fn() }
  }
}

it('adds settings only when configured and preserves the draft and transcript', function () {
  const fixture = controller()
  const element = mount(fixture.api)
  const root = element.shadowRoot!
  expect(root.querySelector('[part="settings-button"]')).toBeNull()
  const content = document.createElement('p')
  content.slot = 'settings'
  content.textContent = 'Application diagnostics'
  element.append(content)
  fixture.publish({
    state: 'idle',
    messages: [{ id: 'reply', role: 'assistant', text: 'Saved reply' }]
  })
  const message = root.querySelector('li')
  element.setDraft('Unsent question')
  element.configure({ controller: fixture.api, settings: settings() })
  const button = root.querySelector<HTMLButtonElement>('[part="settings-button"]')!
  const region = root.querySelector<HTMLElement>('[part="settings"]')!
  expect(region.hidden).toBe(true)
  expect(button.getAttribute('aria-controls')).toBe(region.id)
  button.click()
  expect(region.hidden).toBe(false)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(root.querySelector<HTMLElement>('.composer')!.hidden).toBe(true)
  expect(root.querySelector<HTMLSlotElement>('slot[name="settings"]')!.assignedElements()).toEqual([
    content
  ])
  root.querySelector<HTMLButtonElement>('[data-settings-close]')!.click()
  expect(root.activeElement).toBe(button)
  expect(root.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Unsent question')
  expect(root.querySelector('li')).toBe(message)
  expect(fixture.api.clear).not.toHaveBeenCalled()
  expect(fixture.api.stop).not.toHaveBeenCalled()
  button.click()
  element.configure({ controller: fixture.api })
  expect(root.querySelector('[part="settings"]')).toBeNull()
  expect(root.querySelector<HTMLElement>('.composer')!.hidden).toBe(false)
  expect(root.activeElement).toBe(root.querySelector('textarea'))
})

it('ports provider, model and approval controls without owning resolver or approval behavior', function () {
  const fixture = controller()
  const element = mount(fixture.api)
  const options = settings()
  element.configure({ controller: fixture.api, settings: options })
  const root = element.shadowRoot!
  root.querySelector<HTMLButtonElement>('[part="settings-button"]')!.click()
  const [provider, model] = root.querySelectorAll('select')
  provider.value = 'second'
  provider.dispatchEvent(new Event('change'))
  expect(options.onChange).toHaveBeenCalledWith('second', 'two')
  element.configure({
    controller: fixture.api,
    settings: { ...options, providerId: 'second', model: 'two' }
  })
  model.focus()
  model.value = 'three'
  model.dispatchEvent(new Event('change'))
  expect(options.onChange).toHaveBeenCalledWith('second', 'three')
  element.configure({
    controller: fixture.api,
    settings: { ...options, providerId: 'second', model: 'three', detail: 'Updated status' }
  })
  expect(root.activeElement).toBe(model)
  expect(root.querySelector<HTMLElement>('[part="settings"]')!.hidden).toBe(false)
  const checkbox = root.querySelector<HTMLInputElement>('[type="checkbox"]')!
  checkbox.click()
  expect(options.confirmations!.onChange).toHaveBeenCalledWith(false)
  expect(fixture.api.send).not.toHaveBeenCalled()
  element.configure({
    controller: fixture.api,
    settings: { ...options, providerId: 'built-in', confirmations: undefined }
  })
  expect(model.hidden).toBe(true)
  expect(root.querySelector<HTMLElement>('.settings-approval')!.hidden).toBe(true)
})

it('disables changes while busy and renders labels and errors as text', function () {
  const fixture = controller()
  const element = mount(fixture.api)
  const options = settings()
  element.configure({
    controller: fixture.api,
    settings: { ...options, disabled: true, error: '<img src=x onerror=alert(1)>' },
    labels: { settings: 'Definições', closeSettings: 'Fechar definições' }
  })
  const root = element.shadowRoot!
  const button = root.querySelector<HTMLButtonElement>('[part="settings-button"]')!
  expect(button.getAttribute('aria-label')).toBe('Definições')
  expect(button.disabled).toBe(false)
  button.click()
  expect(root.querySelector('fieldset')!.disabled).toBe(true)
  const provider = root.querySelector('select')!
  provider.value = 'second'
  provider.dispatchEvent(new Event('change'))
  expect(options.onChange).not.toHaveBeenCalled()
  expect(root.querySelector('.settings-error')!.textContent).toContain('<img')
  expect(root.querySelector('img')).toBeNull()
})

it('closes settings before a popup on Escape and restores focus when reopened', function () {
  const fixture = controller()
  const element = mount(fixture.api)
  element.configure({ controller: fixture.api, mode: 'popup', settings: settings() })
  element.open()
  const root = element.shadowRoot!
  const button = root.querySelector<HTMLButtonElement>('[part="settings-button"]')!
  const close = root.querySelector<HTMLButtonElement>('[data-settings-close]')!
  button.click()
  close.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })
  )
  expect(button.getAttribute('aria-expanded')).toBe('true')
  close.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
  expect(root.querySelector<HTMLElement>('.panel')!.hidden).toBe(false)
  expect(root.activeElement).toBe(button)
  button.click()
  element.close()
  element.open()
  expect(root.activeElement).toBe(close)
  element.focusComposer()
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(root.activeElement).toBe(root.querySelector('textarea'))
})
