import type { PiError, PiErrorCode, PiErrorReason } from './interfaces/controller'

export class PiFailure extends Error {
  readonly reason?: PiErrorReason
  readonly actionMayHaveRun?: boolean

  constructor(
    readonly code: PiErrorCode,
    message: string,
    details: { reason?: PiErrorReason; actionMayHaveRun?: boolean } = {}
  ) {
    super(message)
    this.name = 'PiFailure'
    if (details.reason) this.reason = details.reason
    if (details.actionMayHaveRun) this.actionMayHaveRun = true
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
      'conversation_busy'
    ].includes(error.code) && typeof error.message === 'string'
  )
}

export function piError(error: unknown, code: PiErrorCode = 'provider_failed'): PiError {
  // Libraries wrap failures (for example pi-durable's SessionFailed); the original code is in `cause`.
  let current = error
  for (let depth = 0; depth < 5 && current && !isPiError(current); depth++)
    current = (current as { cause?: unknown }).cause
  if (isPiError(current)) {
    const known = current as PiError
    return {
      code: known.code,
      message: known.message,
      ...(known.reason ? { reason: known.reason } : {}),
      ...(known.actionMayHaveRun ? { actionMayHaveRun: true } : {})
    }
  }
  const overflow = isContextOverflowError(error)
  return {
    code,
    message: error instanceof Error ? error.message : String(error),
    ...(overflow ? { reason: 'context_overflow' as const } : {})
  }
}

/** Whether a failure, or one it wraps, is a typed resolver context overflow. */
export function isContextOverflowError(error: unknown): boolean {
  let current = error
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if ((current as { code?: unknown }).code === 'context_overflow') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
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
