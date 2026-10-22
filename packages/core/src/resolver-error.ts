export type ResolverErrorCode = 'context_overflow' | 'provider_failed'

/** A provider failure with a stable code, so callers need not parse provider prose. */
export class ResolverError extends Error {
  readonly code: ResolverErrorCode
  readonly status?: number

  constructor(message: string, code: ResolverErrorCode, status?: number) {
    super(message)
    this.name = 'ResolverError'
    this.code = code
    if (status !== undefined) this.status = status
  }
}

export function isResolverError(value: unknown): value is ResolverError {
  return value instanceof ResolverError
}

const contextOverflowPattern =
  /context[ _]length|context window|maximum context|too many tokens|prompt is too long|input is too long|exceeds? the (?:model'?s? )?context|reduce the length|n_ctx|quotaexceeded/i

export function isContextOverflowText(text: string): boolean {
  return contextOverflowPattern.test(text)
}

const maxProviderMessageLength = 300

/** Builds an error from a failed HTTP response, keeping a bounded provider message. */
export async function createResponseError(
  label: string,
  response: Response
): Promise<ResolverError> {
  let detail = ''
  try {
    const text = await response.text()
    try {
      const payload = JSON.parse(text) as { error?: unknown; message?: unknown }
      const error = payload.error
      detail =
        typeof error === 'string'
          ? error
          : error &&
              typeof error === 'object' &&
              typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : typeof payload.message === 'string'
              ? payload.message
              : ''
    } catch {
      detail = text
    }
  } catch {
    detail = ''
  }
  detail = detail.trim().replace(/\s+/g, ' ')
  if (detail.length > maxProviderMessageLength)
    detail = `${detail.slice(0, maxProviderMessageLength - 1)}…`
  return new ResolverError(
    detail
      ? `${label} returned ${response.status}: ${detail}`
      : `${label} returned ${response.status}`,
    isContextOverflowText(detail) ? 'context_overflow' : 'provider_failed',
    response.status
  )
}
