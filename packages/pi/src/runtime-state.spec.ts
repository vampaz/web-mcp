import { expect, it } from 'vitest'
import { transitionRuntime } from './runtime-state'
import type { RuntimeState } from './interfaces/runtime-state'

it('retains ownership while stopping and ignores stale settlement and new operations', function ownership() {
  const operation = {
    kind: 'running' as const,
    controller: new AbortController(),
    promise: Promise.resolve({ status: 'completed' as const })
  }
  const running = transitionRuntime({ kind: 'ready' }, { type: 'start', operation })
  const stopping = transitionRuntime(running, { type: 'stop' })
  expect(stopping).toEqual({ ...operation, kind: 'stopping' })
  expect(transitionRuntime(stopping, { type: 'start', operation })).toBe(stopping)
  expect(transitionRuntime(stopping, { type: 'settle', promise: Promise.resolve() })).toBe(stopping)
  expect(transitionRuntime(stopping, { type: 'settle', promise: operation.promise })).toEqual({
    kind: 'ready'
  })
})

it('does not reopen a closing or closed runtime when pending work settles', function closing() {
  const promise = Promise.resolve()
  const closing = transitionRuntime({ kind: 'ready' }, { type: 'close', promise })
  expect(transitionRuntime(closing, { type: 'settle', promise })).toBe(closing)
  expect(transitionRuntime(closing, { type: 'close', promise: Promise.resolve() })).toBe(closing)
  const closed = transitionRuntime(closing, { type: 'closed' })
  for (const state of [closing, closed] satisfies RuntimeState[])
    expect(
      transitionRuntime(state, { type: 'start', operation: { kind: 'clearing', promise } })
    ).toBe(state)
  expect(closed).toEqual({ kind: 'closed' })
})

it('retains the latest cross-tab change while opening', function opening() {
  const changed = transitionRuntime({ kind: 'opening', pending: 'none' }, { type: 'changed' })
  expect(changed).toEqual({ kind: 'opening', pending: 'changed' })
  expect(transitionRuntime(changed, { type: 'cleared' })).toEqual({
    kind: 'opening',
    pending: 'cleared'
  })
  expect(transitionRuntime(changed, { type: 'opened' })).toEqual({ kind: 'ready' })
})
