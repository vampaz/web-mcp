import type { ResolverModelLimits } from './interfaces/tool'

// https://developers.openai.com/api/docs/models/{model}
const openAIModels: Record<string, ResolverModelLimits> = {
  'gpt-6-luna': { contextWindow: 1_050_000, maxInputTokens: 922_000, maxOutputTokens: 128_000 },
  'gpt-5.4-mini': { contextWindow: 400_000, maxInputTokens: 272_000, maxOutputTokens: 128_000 },
  'gpt-5.4-mini-2026-03-17': {
    contextWindow: 400_000,
    maxInputTokens: 272_000,
    maxOutputTokens: 128_000
  }
}

export function knownOpenAIModelLimits(model: string): ResolverModelLimits | undefined {
  const limits = Object.hasOwn(openAIModels, model) ? openAIModels[model] : undefined
  return limits ? { ...limits } : undefined
}

export function validateModelLimits(limits: ResolverModelLimits): ResolverModelLimits {
  for (const [field, value] of Object.entries(limits))
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 2_000_000))
      throw new Error(`Model ${field} must be an integer between 1 and 2000000.`)
  if (
    !limits.contextWindow ||
    (limits.maxInputTokens ?? 0) > limits.contextWindow ||
    (limits.maxOutputTokens ?? 0) >= limits.contextWindow
  )
    throw new Error('Model input and output limits must fit its context window.')
  return limits
}
