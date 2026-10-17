import { expect, it } from 'vitest'
import { piSessionKey, resolvePiLimits } from './session'

it('partitions all session components without separator collisions', function test() {
  expect(piSessionKey({ namespace: 'a:b', ownerId: 'c', conversationId: 'd' })).not.toBe(
    piSessionKey({ namespace: 'a', ownerId: 'b:c', conversationId: 'd' })
  )
  expect(function missing() {
    piSessionKey({ namespace: '', ownerId: 'c', conversationId: 'd' })
  }).toThrow()
  expect(function invalid() {
    piSessionKey({ namespace: 'a\u0000'.repeat(100), ownerId: 'c', conversationId: 'd' })
  }).toThrow('printable')
})
it('bounds configurable tool, history, and request budgets', function test() {
  expect(resolvePiLimits().maxToolCalls).toBe(12)
  for (const maxToolCalls of [0, 51, NaN, 1.1])
    expect(function invalid() {
      resolvePiLimits({ maxToolCalls })
    }).toThrow()
})
