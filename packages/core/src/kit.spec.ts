import { describe, expect, it } from 'vitest'

import { createWebMCPKit } from './kit'

describe('createWebMCPKit', () => {
  it('initializes with the configured resolver', async () => {
    const kit = await createWebMCPKit({
      resolver: {
        provider: 'openrouter',
        model: 'openrouter/auto',
        auth: {
          mode: 'user-key'
        }
      }
    })

    expect(kit.resolver.name).toBe('OpenRouter')
    expect(kit.resolver.status).toBe('needs-key')
    expect(kit.resolverConfig?.provider).toBe('openrouter')
  })
})
