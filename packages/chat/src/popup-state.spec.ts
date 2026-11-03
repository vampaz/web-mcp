import { expect, it } from 'vitest'
import { transitionPopup, transitionPopupGesture, transitionPopupSize } from './popup-state'

it('preserves an open request before attachment and closes on real disconnection', function attachment() {
  const inline = { kind: 'inline' as const }
  expect(transitionPopup(inline, { type: 'open' })).toBe(inline)
  const detached = transitionPopup(inline, { type: 'configure', mode: 'popup' })
  const pending = transitionPopup(detached, { type: 'open' })
  expect(transitionPopup(pending, { type: 'connect' })).toEqual({ kind: 'open' })
  expect(transitionPopup({ kind: 'open' }, { type: 'disconnect' })).toEqual({
    kind: 'detached',
    visibility: 'closed'
  })
  expect(transitionPopup({ kind: 'open' }, { type: 'configure', mode: 'inline' })).toEqual(inline)
})

it('owns one pointer gesture and retains drag click suppression until the next press', function pointers() {
  const start = { pointerId: 1, x: 0, y: 0, position: { x: 0, y: 0 } }
  const control = document.createElement('button')
  const pressed = transitionPopupGesture({ kind: 'idle' }, { type: 'press', start, control })
  expect(transitionPopupGesture(pressed, { type: 'move', pointerId: 2 })).toBe(pressed)
  const dragging = transitionPopupGesture(pressed, { type: 'move', pointerId: 1 })
  expect(transitionPopupGesture(dragging, { type: 'end', pointerId: 2 })).toBe(dragging)
  const dragged = transitionPopupGesture(dragging, { type: 'end', pointerId: 1 })
  expect(dragged.kind).toBe('dragged')
  expect(transitionPopupGesture(dragged, { type: 'press', start, control }).kind).toBe('pressed')
  expect(transitionPopupGesture(dragging, { type: 'reset' })).toEqual({ kind: 'idle' })
  expect(transitionPopupSize('normal', 'toggle')).toBe('expanded')
  expect(transitionPopupSize('expanded', 'reset')).toBe('normal')
})

it('replaces an interrupted touch gesture with the next pointer interaction', function interruptedTouch() {
  const control = document.createElement('button')
  const old = transitionPopupGesture(
    { kind: 'idle' },
    { type: 'press', control, start: { pointerId: 7, x: 0, y: 0, position: { x: 0, y: 0 } } }
  )
  const next = transitionPopupGesture(old, {
    type: 'press',
    control,
    start: { pointerId: 8, x: 50, y: 20, position: { x: 10, y: 10 } }
  })
  expect(next).toMatchObject({ kind: 'pressed', start: { pointerId: 8, x: 50 } })
  expect(transitionPopupGesture(next, { type: 'end', pointerId: 7 })).toBe(next)
  expect(transitionPopupGesture(next, { type: 'move', pointerId: 8 }).kind).toBe('dragging')
})
