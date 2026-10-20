import { afterEach, expect, it } from 'vitest'
import { getConfirmationHandler, setConfirmationHandler } from './confirmation'

afterEach(() => setConfirmationHandler(undefined))

it('supports nested owners and out-of-order disposal without restoring a removed handler', () => {
  function first() {
    return true
  }
  function second() {
    return false
  }
  const disposeFirst = setConfirmationHandler(first)
  const disposeSecond = setConfirmationHandler(second)
  disposeFirst()
  expect(getConfirmationHandler()).toBe(second)
  disposeSecond()
  expect(getConfirmationHandler()).toBeUndefined()
  disposeFirst()
  const dispose = setConfirmationHandler(first)
  const top = setConfirmationHandler(second)
  top()
  expect(getConfirmationHandler()).toBe(first)
  dispose()
})
