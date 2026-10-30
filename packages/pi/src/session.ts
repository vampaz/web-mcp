import type { PiLimits, PiSession } from './interfaces/session'
import type { ResolverModelLimits } from '@vampaz/webmcp-kit'
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

export function resolvePiLimits(limits: PiLimits = {}, model?: ResolverModelLimits) {
  if (model) {
    for (const value of [model.contextWindow, model.maxInputTokens, model.maxOutputTokens])
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 2_000_000))
        throw new PiFailure('configuration', 'The resolver reported invalid model limits.')
    if (
      !model.contextWindow ||
      (model.maxInputTokens ?? 0) > model.contextWindow ||
      (model.maxOutputTokens ?? 0) >= (limits.contextTokens || model.contextWindow)
    )
      throw new PiFailure(
        'configuration',
        'The model input and output limits must fit its context window.'
      )
  }
  const contextTokens = limits.contextTokens ?? model?.contextWindow ?? 0
  const result = {
    maxToolCalls: 12,
    maxHistoryBytes: 8 * 1024 * 1024,
    maxRequestBytes: contextTokens ? contextTokens * 4 : 128 * 1024,
    requestTimeoutMs: 120_000,
    contextTokens,
    maxMessageChars: 16_000,
    ...limits
  }
  for (const [key, min, max] of [
    ['maxToolCalls', 1, 50],
    ['maxHistoryBytes', 65536, 8 * 1024 * 1024],
    ['maxRequestBytes', 1024, 8 * 1024 * 1024],
    ['requestTimeoutMs', 1000, 600_000],
    ['contextTokens', 0, 2_000_000],
    ['maxMessageChars', 1, 100_000]
  ] as const) {
    if (!Number.isSafeInteger(result[key]) || result[key] < min || result[key] > max) {
      throw new PiFailure('configuration', `${key} must be an integer between ${min} and ${max}.`)
    }
  }
  return result
}
