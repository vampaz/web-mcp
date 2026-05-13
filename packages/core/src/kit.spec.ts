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
})
