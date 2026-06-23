import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  WebMCPAccessKeyMetadata,
  WebMCPAccessValidationResult,
  WebMCPHostedPaidServiceMetadata
} from './interfaces/access-key'
import type { WebMCPCommandInputEndpointOption } from './interfaces/command-input'
import type { PlannerProviderConfig } from './interfaces/tool'

describe('paid service metadata', () => {
  it('allows endpoint options to describe WebMCP-hosted paid services without a key', () => {
    const paidService: WebMCPHostedPaidServiceMetadata = {
      endpoint: 'https://api.webmcp.dev/v1/plan',
      label: 'Hosted OpenAI planner',
      requiresAccessKey: true,
      serviceId: 'hosted-openai-planner'
    }
    const option: WebMCPCommandInputEndpointOption = {
      label: 'GPT-5.4 mini',
      model: 'gpt-5.4-mini',
      paidService,
      provider: 'openai'
    }

    expect(option.paidService?.serviceId).toBe('hosted-openai-planner')
    expect(option.paidService?.requiresAccessKey).toBe(true)
  })

  it('keeps paid service metadata generic across services', () => {
    const plannerConfig: PlannerProviderConfig = {
      auth: {
        endpoint: 'https://api.webmcp.dev/v1/plan',
        mode: 'server'
      },
      model: 'gpt-5.4-mini',
      paidService: {
        serviceId: 'hosted-openai-planner'
      },
      provider: 'openai'
    }
    const analyticsService: WebMCPHostedPaidServiceMetadata = {
      serviceId: 'analytics'
    }

    expect(plannerConfig.paidService?.serviceId).toBe('hosted-openai-planner')
    expect(analyticsService.serviceId).toBe('analytics')
  })

  it('models server validation results without exposing a raw key field', () => {
    const metadata: WebMCPAccessKeyMetadata = {
      allowedOrigins: ['https://example.com'],
      analyticsOptIn: true,
      customerId: 'cus_123',
      environment: 'test',
      issuedAt: '2026-06-23T00:00:00.000Z',
      keyType: 'publishable',
      projectId: 'prj_123',
      services: [
        {
          quota: {
            exhausted: false,
            remaining: 100
          },
          serviceId: 'hosted-openai-planner'
        }
      ]
    }
    const result: WebMCPAccessValidationResult = {
      fingerprint: 'pk_live_abc123',
      metadata,
      valid: true
    }

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.metadata.keyType).toBe('publishable')
    }
    expectTypeOf(metadata).not.toHaveProperty('rawKey')
  })
})
