import { expect, it } from 'vitest'
import { transitionChatOperation } from './chat-state'

it('serializes local operations and ignores completions from a previous controller', function replaced() {
  const sending = transitionChatOperation({ kind: 'idle', revision: 0 }, { type: 'send' })
  expect(transitionChatOperation(sending, { type: 'clear' })).toBe(sending)
  expect(
    transitionChatOperation(sending, { type: 'settle', operation: 'clearing', revision: 0 })
  ).toBe(sending)
  const reset = transitionChatOperation(sending, { type: 'reset' })
  const clearing = transitionChatOperation(reset, { type: 'clear' })
  expect(
    transitionChatOperation(clearing, { type: 'settle', operation: 'sending', revision: 0 })
  ).toBe(clearing)
  expect(
    transitionChatOperation(clearing, { type: 'settle', operation: 'clearing', revision: 1 })
  ).toEqual({ kind: 'idle', revision: 1 })
})
