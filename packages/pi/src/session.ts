import type { PiLimits, PiSession } from './interfaces/session'
import { PiFailure } from './errors'

export function piSessionKey(session: PiSession): string {
  if (
    !session ||
    !['namespace', 'ownerId', 'conversationId'].every(function valid(key) {
      const value = session[key as keyof PiSession]
      return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 200 &&
        Array.from(value).every(function printable(character) {
          const code = character.charCodeAt(0)
          return code >= 32 && code !== 127
        })
      )
    })
  )
    throw new PiFailure(
      'configuration',
      'Provide a namespace, ownerId, and conversationId of 1–200 printable characters.'
    )
  return `webmcp-kit-pi-v1:${JSON.stringify([session.namespace, session.ownerId, session.conversationId])}`
}

export function resolvePiLimits(limits: PiLimits = {}): Required<PiLimits> {
  const result = {
    maxToolCalls: 12,
    maxHistoryBytes: 8 * 1024 * 1024,
    maxRequestBytes: 128 * 1024,
    ...limits
  }
  for (const [key, min, max] of [
    ['maxToolCalls', 1, 50],
    ['maxHistoryBytes', 65536, 8 * 1024 * 1024],
    ['maxRequestBytes', 1024, 1024 * 1024]
  ] as const) {
    if (!Number.isSafeInteger(result[key]) || result[key] < min || result[key] > max) {
      throw new PiFailure('configuration', `${key} must be an integer between ${min} and ${max}.`)
    }
  }
  return result
}
