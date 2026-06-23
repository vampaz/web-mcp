import { describe, expect, it } from 'vitest'

import { createWebMCPKit } from './kit'

describe('createWebMCPKit', () => {
  it('initializes with the configured planner', async () => {
    const kit = await createWebMCPKit({
      planner: {
        provider: 'openrouter',
        model: 'openrouter/auto',
        auth: {
          mode: 'user-key'
        }
      }
    })

    expect(kit.planner.name).toBe('OpenRouter')
    expect(kit.planner.status).toBe('needs-key')
    expect(kit.plannerConfig?.provider).toBe('openrouter')
  })

  it('keeps paid hosted services optional and scoped to configured planners', async () => {
    const kit = await createWebMCPKit({
      paidServices: {
        accessKey: 'wmcp-publishable-test-key',
        services: [
          {
            requiresAccessKey: true,
            serviceId: 'hosted-openai-planner'
          }
        ]
      },
      planner: {
        auth: {
          endpoint: 'https://api.webmcp.dev/v1/plan',
          mode: 'server'
        },
        paidService: {
          requiresAccessKey: true,
          serviceId: 'hosted-openai-planner'
        },
        provider: 'openai'
      }
    })

    expect(kit.paidServices?.accessKey).toBe('wmcp-publishable-test-key')
    expect(kit.planner.status).toBe('ready')
    expect(kit.plannerConfig?.paidServices?.services?.[0]?.serviceId).toBe('hosted-openai-planner')
  })
})
