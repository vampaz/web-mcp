import { expect, it } from 'vitest'
import { transitionAction, withActionRisk } from './action-state'

it('distinguishes invocation, receipt, and persistence and ignores acknowledgements for other calls', function acknowledgement() {
  const invoking = transitionAction({ kind: 'not-started' }, { type: 'invoke', callId: 'one' })
  expect(transitionAction(invoking, { type: 'persist', callId: 'one' })).toBe(invoking)
  expect(transitionAction(invoking, { type: 'receive', callId: 'other' })).toBe(invoking)
  const received = transitionAction(invoking, { type: 'receive', callId: 'one' })
  expect(received.kind).toBe('received')
  expect(transitionAction(received, { type: 'persist', callId: 'other' })).toBe(received)
  const persisted = transitionAction(received, { type: 'persist', callId: 'one' })
  expect(persisted).toEqual({ kind: 'persisted', callId: 'one' })
  expect(transitionAction(persisted, { type: 'invoke', callId: 'two' })).toEqual({
    kind: 'invoking',
    callId: 'two'
  })
})

it('warns about unacknowledged actions without marking durable outcomes as unknown', function risk() {
  const failure = { code: 'storage_failed' as const, message: 'Save failed' }
  expect(withActionRisk({ kind: 'invoking', callId: 'one' }, failure).actionMayHaveRun).toBe(true)
  expect(withActionRisk({ kind: 'received', callId: 'one' }, failure).actionMayHaveRun).toBe(true)
  expect(withActionRisk({ kind: 'persisted', callId: 'one' }, failure)).toBe(failure)
})
