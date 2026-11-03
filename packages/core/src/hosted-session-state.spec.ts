import { expect, it } from 'vitest'
import { transitionHostedSession } from './hosted-session-state'
import type { HostedSessionState, PaidAccessSession } from './interfaces/hosted-session-state'

it('releases an acquisition only when the final caller cancels and ignores its late result', function cancellation() {
  const session: PaidAccessSession = { token: 'test', tokenType: 'Bearer' }
  const request = { promise: Promise.resolve(session), controller: new AbortController() }
  let state: HostedSessionState = transitionHostedSession(
    { kind: 'empty' },
    { type: 'acquire', request }
  )
  state = transitionHostedSession(state, { type: 'join', request })
  state = transitionHostedSession(state, { type: 'join', request })
  state = transitionHostedSession(state, { type: 'leave', request, cancelled: true })
  expect(state).toMatchObject({ kind: 'acquiring', waiters: 1 })
  state = transitionHostedSession(state, { type: 'leave', request, cancelled: true })
  expect(state).toEqual({ kind: 'empty' })
  expect(transitionHostedSession(state, { type: 'resolve', request, session })).toBe(state)
})

it('invalidates only the session rejected by the server', function authentication() {
  const session: PaidAccessSession = { token: 'new', tokenType: 'Bearer' }
  const ready: HostedSessionState = { kind: 'ready', session }
  expect(
    transitionHostedSession(ready, {
      type: 'invalidate',
      session: { token: 'old', tokenType: 'Bearer' }
    })
  ).toBe(ready)
  expect(transitionHostedSession(ready, { type: 'invalidate', session })).toEqual({ kind: 'empty' })
})
