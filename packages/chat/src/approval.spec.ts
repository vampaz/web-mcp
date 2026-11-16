import { expect, it, vi } from 'vitest'
import { ChatApproval } from './approval'
import { createLabels } from './labels'

const labels = createLabels()

function setup(toolLabel?: (name: string) => string) {
  const container = document.createElement('div')
  document.body.append(container)
  const onOpen = vi.fn()
  const onResolve = vi.fn()
  const approval = new ChatApproval(container, {
    getLabels: () => labels,
    getToolLabel: () => toolLabel,
    onOpen,
    onResolve
  })
  return { container, approval, onOpen, onResolve }
}

it('renders the request with Deny focused and resolves the decision', async function approval() {
  const { container, approval, onOpen, onResolve } = setup(function label(name) {
    return name === 'set_counter' ? 'Set counter' : name
  })
  const pending = approval.request({
    toolName: 'set_counter',
    input: { value: 7 },
    reason: 'Change the application counter?'
  })

  expect(onOpen).toHaveBeenCalledOnce()
  const card = container.querySelector<HTMLElement>('.approval-card')!
  expect(card.getAttribute('role')).toBe('group')
  expect(card.getAttribute('aria-label')).toBe('Approval needed')
  expect(card.querySelector('.approval-reason')!.textContent).toBe(
    'Change the application counter?'
  )
  expect(card.querySelector('.approval-tool')!.textContent).toBe('Set counter')
  expect(card.querySelector('.approval-input')!.textContent).toBe('{"value":7}')
  const [deny] = Array.from(card.querySelectorAll('button'))
  expect(container.ownerDocument.activeElement).toBe(deny)
  deny!.click()
  await expect(pending).resolves.toBe(false)
  expect(container.childElementCount).toBe(0)
  expect(onResolve).toHaveBeenLastCalledWith(false, true)

  const accepted = approval.request({
    toolName: 'set_counter',
    input: { value: 8 },
    reason: 'Change again?'
  })
  container.querySelectorAll('button')[1]!.click()
  await expect(accepted).resolves.toBe(true)
  expect(onResolve).toHaveBeenLastCalledWith(true, true)
})

it('denies a replaced card and resolves false on abort or cancel', async function lifecycle() {
  const { container, approval, onResolve } = setup()
  const first = approval.request({
    toolName: 'set_counter',
    input: { value: 1 },
    reason: 'First?'
  })
  const controller = new AbortController()
  const second = approval.request({
    toolName: 'set_counter',
    input: { value: 2 },
    reason: 'Second?',
    signal: controller.signal
  })
  await expect(first).resolves.toBe(false)
  expect(container.textContent).toContain('Second?')
  controller.abort()
  await expect(second).resolves.toBe(false)
  expect(container.childElementCount).toBe(0)

  const third = approval.request({
    toolName: 'set_counter',
    input: { value: 3 },
    reason: 'Third?'
  })
  approval.cancel()
  await expect(third).resolves.toBe(false)
  expect(onResolve).toHaveBeenCalledTimes(3)
})

it('returns false for an already aborted request without showing a card', async function aborted() {
  const { container, approval, onOpen } = setup()
  await expect(
    approval.request({
      toolName: 'save',
      input: {},
      reason: 'Save?',
      signal: AbortSignal.abort()
    })
  ).resolves.toBe(false)
  expect(container.childElementCount).toBe(0)
  expect(onOpen).not.toHaveBeenCalled()
})

it('caps long argument summaries and handles unserializable input', async function summary() {
  const { container, approval } = setup()
  const pending = approval.request({
    toolName: 'save',
    input: { note: 'x'.repeat(800) },
    reason: 'Save?'
  })
  const text = container.querySelector('.approval-input')!.textContent!
  expect(text.length).toBeLessThanOrEqual(500)
  expect(text.endsWith('…')).toBe(true)
  approval.cancel()
  await expect(pending).resolves.toBe(false)

  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  const next = approval.request({ toolName: 'save', input: cyclic, reason: 'Save?' })
  expect(container.querySelector('.approval-input')!.textContent).toBe('[unserializable input]')
  approval.cancel()
  await expect(next).resolves.toBe(false)
})
