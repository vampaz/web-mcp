import { expect, it } from 'vitest'
import type { PiController } from './interfaces/controller'
import { transitionConnection } from './connection-state'

it('ignores old suspension completions and cannot resume after closing', function suspension() {
  const promise = Promise.resolve()
  const runtime = {} as PiController
  const suspended = transitionConnection({ kind: 'active', runtime }, { type: 'suspend', promise })
  expect(transitionConnection(suspended, { type: 'opened', runtime })).toBe(suspended)
  expect(transitionConnection(suspended, { type: 'resume', promise: Promise.resolve() })).toBe(
    suspended
  )
  expect(transitionConnection(suspended, { type: 'resume', promise })).toEqual({
    kind: 'active',
    runtime
  })
  const closing = transitionConnection(suspended, { type: 'close', promise })
  expect(transitionConnection(closing, { type: 'resume', promise })).toBe(closing)
  const closed = transitionConnection(closing, { type: 'closed' })
  expect(transitionConnection(closed, { type: 'suspend', promise })).toBe(closed)
})

it('cannot become active before an opening runtime exists', function opening() {
  const runtime = {} as PiController
  const opening = Promise.resolve(runtime)
  const promise = Promise.resolve()
  const suspended = transitionConnection({ kind: 'opening', opening }, { type: 'suspend', promise })
  expect(transitionConnection(suspended, { type: 'resume', promise })).toEqual({
    kind: 'opening',
    opening
  })
  expect(transitionConnection(suspended, { type: 'opened', runtime })).toEqual({
    kind: 'suspending',
    runtime,
    promise
  })
})
