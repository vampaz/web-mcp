import type { RemoteResolverConfig, ResolverModelLimits } from './interfaces/tool'
import { knownOpenAIModelLimits, validateModelLimits } from './resolver-model-limits'

/** Metadata only: unavailable discovery must not prevent inference or invent a capacity. */
export async function remoteModelLimits(
  config: RemoteResolverConfig,
  model: string,
  apiKey: string | undefined,
  signal?: AbortSignal
): Promise<ResolverModelLimits | undefined> {
  signal?.throwIfAborted()
  const officialOpenAI =
    config.provider === 'openai' &&
    (!config.baseUrl || config.baseUrl.replace(/\/$/, '') === 'https://api.openai.com/v1')
  const supplied =
    config.modelLimits ?? (officialOpenAI ? knownOpenAIModelLimits(model) : undefined)
  if (supplied)
    return validateModelLimits({
      ...supplied,
      ...(config.maxTokens ? { maxOutputTokens: config.maxTokens } : {})
    })
  if (officialOpenAI) return
  if (config.provider === 'cloudflare-binding') return
  const baseUrl =
    config.baseUrl ??
    (config.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined)
  if (!baseUrl) return
  const endpoint = baseUrl.replace(/\/$/, '')
  const deadline = AbortSignal.timeout(10_000)
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
  try {
    const response = await fetch(
      config.provider === 'openrouter'
        ? `${endpoint}/models`
        : `${endpoint.replace(/\/v1$/, '')}/api/v1/models`,
      {
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        credentials: 'omit',
        redirect: 'error',
        signal: requestSignal
      }
    )
    if (!response.ok) {
      await response.body?.cancel()
      return
    }
    const payload = await response.json()
    if (config.provider === 'openrouter') {
      const entry = payload?.data?.find((entry: { id?: unknown }) => entry?.id === model)
      if (!entry?.context_length) return
      const contextWindow = Math.min(
        entry.context_length,
        entry.top_provider?.context_length ?? Infinity
      )
      const outputTokens = config.maxTokens ?? entry.top_provider?.max_completion_tokens
      return validateModelLimits({
        contextWindow,
        ...(outputTokens && outputTokens < contextWindow ? { maxOutputTokens: outputTokens } : {})
      })
    }
    // LM Studio's loaded context can be much smaller than a model's advertised maximum.
    for (const entry of payload?.models ?? []) {
      if (entry?.type !== 'llm' || !Array.isArray(entry.loaded_instances)) continue
      const instances = entry.loaded_instances.filter(
        (instance: { id?: unknown }) => instance?.id === model || entry.key === model
      )
      if (!instances.length) continue
      const lengths = instances.map(
        (instance: { config?: { context_length?: number } }) => instance.config?.context_length
      )
      if (lengths.some((length: unknown) => typeof length !== 'number')) return
      return validateModelLimits({
        contextWindow: Math.min(...lengths),
        ...(config.maxTokens ? { maxOutputTokens: config.maxTokens } : {})
      })
    }
  } catch {
    signal?.throwIfAborted()
  }
}
