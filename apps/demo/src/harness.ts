import { createRemoteResolver, type ToolResolver } from '@vampaz/webmcp-kit'
import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'

let currentHarness: PiController | undefined

export async function stopDemoHarness() {
  await currentHarness?.stop()
}

export async function openDemoHarness(
  mode: string,
  getValue: () => number,
  onStatus: (text: string) => void
): Promise<PiController> {
  const config = (await fetch('/__demo-config').then(function json(response) {
    return response.json()
  })) as { modelId: string; fixtures: boolean }
  let resolver: ToolResolver
  if (config.fixtures) {
    const { createFixtureResolver } = await import('./fixtures/resolver')
    resolver = createFixtureResolver()
  } else {
    if (!config.modelId)
      throw new Error(
        'Set LM_STUDIO_MODEL in apps/demo/.env.local, start LM Studio, and load that exact model.'
      )
    const response = await fetch('/__lmstudio/v1/models')
    if (!response.ok)
      throw new Error('LM Studio is unavailable. Start the local server and load LM_STUDIO_MODEL.')
    const models = (await response.json()) as { data?: { id: string }[] }
    if (
      !models.data?.some(function selected(model) {
        return model.id === config.modelId
      })
    )
      throw new Error(`LM Studio does not expose ${config.modelId}. Load the configured model.`)
    resolver = createRemoteResolver({
      provider: 'openai-compatible',
      baseUrl: '/__lmstudio/v1',
      model: config.modelId,
      responseFormat: 'json_schema',
      maxTokens: 1024,
      temperature: 0.2,
      reasoningEffort: 'none',
      auth: { mode: 'none' }
    })
  }
  onStatus(config.fixtures ? resolver.detail : `LM Studio · ${config.modelId}`)
  const harness = await createPiHarness({
    session: {
      namespace: 'webmcp-kit-local-lab',
      ownerId: 'local-developer',
      conversationId: mode
    },
    worker: { url: '/webmcp-pi/worker.ts', scope: '/webmcp-pi/' },
    resolver,
    context() {
      return { counter: getValue() }
    }
  })
  currentHarness = harness
  return harness
}
