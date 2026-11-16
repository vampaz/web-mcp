import { expect, it } from 'vitest'
import { isToolExecutionError, ToolExecutionError } from './tool-execution-error'

it('recognizes ToolExecutionError instances', function guard() {
  const error = new ToolExecutionError('execution_failed', 'The action failed.', {
    status: 409
  })

  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe('ToolExecutionError')
  expect(error.code).toBe('execution_failed')
  expect(error.details).toEqual({ status: 409 })
  expect(isToolExecutionError(error)).toBe(true)
})

it('rejects plain errors and lookalike values', function notExecution() {
  expect(isToolExecutionError(new Error('plain'))).toBe(false)
  expect(
    isToolExecutionError({ code: 'execution_failed', message: 'lookalike', details: {} })
  ).toBe(false)
  expect(isToolExecutionError(undefined)).toBe(false)
})
