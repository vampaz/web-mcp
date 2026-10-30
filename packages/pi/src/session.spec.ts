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

it('derives defaults from actual model capacity and preserves explicit transport limits', function capacity() {
  const model = { contextWindow: 1_050_000, maxOutputTokens: 128_000 }
  expect(resolvePiLimits({}, model)).toMatchObject({
    contextTokens: 1_050_000,
    maxRequestBytes: 4_200_000
  })
  expect(resolvePiLimits({ maxRequestBytes: 131072 }, model).maxRequestBytes).toBe(131072)
  expect(resolvePiLimits().contextTokens).toBe(0)
  expect(() => resolvePiLimits({}, { contextWindow: NaN })).toThrow('invalid model limits')
  expect(() => resolvePiLimits({}, { contextWindow: 8192, maxOutputTokens: 8192 })).toThrow(
    'fit its context window'
  )
})
