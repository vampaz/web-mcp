import type { PiError, PiErrorCode } from './interfaces/controller'

export class PiFailure extends Error {
  constructor(
    readonly code: PiErrorCode,
    message: string
  ) {
    super(message)
  }
}

export function isPiError(value: unknown): value is PiError {
  if (!value || typeof value !== 'object') return false
  const error = value as PiError
  return (
    [
      'unsupported',
      'configuration',
      'storage_failed',
      'provider_failed',
      'stale_document',
      'action_denied',
      'tool_failed',
      'limit_reached',
      'conversation_busy',
      'transport_failed'
    ].includes(error.code) && typeof error.message === 'string'
  )
}

export function piError(error: unknown, code: PiErrorCode = 'provider_failed'): PiError {
  return {
    code: isPiError(error) ? error.code : code,
    message: isPiError(error) || error instanceof Error ? error.message : String(error)
  }
}

export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise(function wait(resolve, reject) {
    function abort() {
      reject(
        new PiFailure(
          'stale_document',
          'The turn was interrupted. Check current application state before continuing.'
        )
      )
    }
    signal.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(function cleanup() {
      signal.removeEventListener('abort', abort)
    })
    if (signal.aborted) abort()
  })
}
