export type WebMCPKitErrorCode = 'duplicate_tool' | 'invalid_definition' | 'invalid_configuration'

/** A definition, registration, or configuration failure with a stable code. */
export class WebMCPKitError extends Error {
  constructor(
    readonly code: WebMCPKitErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'WebMCPKitError'
  }
}

export function isWebMCPKitError(value: unknown): value is WebMCPKitError {
  return value instanceof WebMCPKitError
}
