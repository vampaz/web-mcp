export class ResolverRequestLimitError extends Error {
  readonly code = 'limit_reached'

  constructor() {
    super('This conversation exceeds the resolver request limit. Clear chat before continuing.')
  }
}

export function serializeResolverRequest(value: unknown, maxBytes?: number): string {
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 1))
    throw new Error('maxRequestBytes must be a positive safe integer.')
  const body = JSON.stringify(value)
  if (maxBytes !== undefined && new TextEncoder().encode(body).byteLength > maxBytes)
    throw new ResolverRequestLimitError()
  return body
}
