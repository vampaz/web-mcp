import type { DemoConfig } from './interfaces/config.ts'

export function resolveDemoConfig(env: Record<string, string | undefined>): DemoConfig {
  const target = new URL(env.LM_STUDIO_BASE_URL || 'http://127.0.0.1:1234/v1')
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    !['127.0.0.1', '[::1]', 'localhost'].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    !/^\/v1\/?$/.test(target.pathname)
  )
    throw new Error('LM_STUDIO_BASE_URL must be a loopback HTTP(S) URL ending in /v1.')
  const modelId = env.LM_STUDIO_MODEL?.trim() ?? ''
  if (modelId.length > 200 || /[\r\n]/.test(modelId)) throw new Error('Invalid LM_STUDIO_MODEL.')
  return {
    baseUrl: target.href.replace(/\/$/, ''),
    modelId,
    token: env.LM_STUDIO_API_TOKEN || undefined,
    fixtures: env.WEBMCP_TEST_FIXTURES === 'true' && env.WEBMCP_BROWSER_TEST === 'true'
  }
}
