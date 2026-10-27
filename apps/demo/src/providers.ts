import { createResolver } from '@vampaz/webmcp-kit'
import type { DemoProvider } from './interfaces/provider'
import { chatModels } from './lm-studio-models'

export function createDemoProviders(fixtures: boolean): DemoProvider[] {
  return [
    {
      id: 'lm-studio',
      label: 'LM Studio (local)',
      models: [],
      async loadModels() {
        const response = await fetch('/__lmstudio/api/v0/models')
        if (!response.ok)
          throw new Error(
            'LM Studio is unavailable. Start its local server, then select LM Studio again.'
          )
        return chatModels(await response.json())
      },
      async create(model) {
        if (!model)
          throw new Error(
            'No chat models are available in LM Studio. Add a model, then select LM Studio again.'
          )
        const resolver = await createResolver({
          provider: 'openai-compatible',
          baseUrl: '/__lmstudio/v1',
          model,
          responseFormat: 'json_schema',
          maxTokens: 1024,
          temperature: 0.2,
          reasoningEffort: 'none',
          auth: { mode: 'none' }
        })
        resolver.detail =
          'Runs on this computer through LM Studio. The selected model loads when you send a message.'
        return resolver
      }
    },
    {
      id: 'chrome-ai',
      label: 'Chrome built-in AI',
      models: [],
      create() {
        return createResolver({ provider: 'chrome-built-in' })
      }
    },
    ...(fixtures
      ? [
          {
            id: 'test',
            label: 'Test responses (no AI)',
            models: [],
            async create() {
              const { createFixtureResolver } = await import('./fixtures/resolver')
              return createFixtureResolver()
            }
          }
        ]
      : [])
  ]
}
