import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WebMCPTool } from './interfaces/tool'
import { createHostedOpenAIPlanner } from './hosted-openai-planner'

const paidAccessKey = 'wmcp_pk_test_access123_secret123secret456'

describe('createHostedOpenAIPlanner', function describeHostedOpenAIPlanner() {
  afterEach(function cleanup() {
    delete window.turnstile
    delete window.webmcpCreateTurnstileToken
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('mints a session before planning and never sends the publishable license to the spend endpoint', async function testSessionFlow() {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          token: 'wmcp_session.test.signature',
          tokenType: 'Bearer'
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          confidence: 0.91,
          input: { ids: ['item_8'] },
          reason: 'Selected water.',
          toolName: 'select_items'
        })
      )
    vi.stubGlobal('fetch', fetch)

    const planner = createHostedOpenAIPlanner({
      accessKey: paidAccessKey,
      endpoint: '/api/webmcp/plan',
      model: 'gpt-5.4-mini',
      sessionEndpoint: '/api/webmcp/session'
    })
    const plan = await planner.plan('Select water', [createSelectItemsTool()], {})

    expect(plan.toolName).toBe('select_items')
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/webmcp/session',
      expect.objectContaining({
        method: 'POST'
      })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/webmcp/plan',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer wmcp_session.test.signature'
        }),
        method: 'POST'
      })
    )

    const planRequest = fetch.mock.calls[1]?.[1] as RequestInit
    expect(JSON.stringify(planRequest)).not.toContain(paidAccessKey)
  })

  it('caches fresh sessions for later plans', async function testSessionCache() {
    const fetch = vi.fn(async function fetchHostedPlanner(url: string) {
      if (url === '/api/webmcp/session') {
        return Response.json({
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          token: 'wmcp_session.test.signature',
          tokenType: 'Bearer'
        })
      }

      return Response.json({
        confidence: 0.91,
        input: { ids: ['item_8'] },
        reason: 'Selected water.',
        toolName: 'select_items'
      })
    })
    vi.stubGlobal('fetch', fetch)

    const planner = createHostedOpenAIPlanner({
      accessKey: paidAccessKey,
      endpoint: '/api/webmcp/plan',
      model: 'gpt-5.4-mini',
      sessionEndpoint: '/api/webmcp/session'
    })

    await planner.plan('Select water', [createSelectItemsTool()], {})
    await planner.plan('Select water again', [createSelectItemsTool()], {})

    expect(
      fetch.mock.calls.filter(function filterSessionCall(call) {
        return call[0] === '/api/webmcp/session'
      })
    ).toHaveLength(1)
  })

  it('passes browser challenge tokens when a provider is registered', async function testChallengeToken() {
    const createToken = vi.fn(async () => 'turnstile-token')
    window.webmcpCreateTurnstileToken = createToken
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          token: 'wmcp_session.test.signature',
          tokenType: 'Bearer'
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          confidence: 0.91,
          input: { ids: ['item_8'] },
          reason: 'Selected water.',
          toolName: 'select_items'
        })
      )
    vi.stubGlobal('fetch', fetch)

    const planner = createHostedOpenAIPlanner({
      accessKey: paidAccessKey,
      endpoint: '/api/webmcp/plan',
      model: 'gpt-5.4-mini',
      sessionEndpoint: '/api/webmcp/session'
    })
    await planner.plan('Select water', [createSelectItemsTool()], {})

    const sessionRequest = fetch.mock.calls[0]?.[1] as RequestInit
    expect(createToken).toHaveBeenCalledWith({
      model: 'gpt-5.4-mini',
      serviceId: 'hosted-openai-planner'
    })
    expect(JSON.parse(String(sessionRequest.body))).toMatchObject({
      turnstileToken: 'turnstile-token'
    })
  })

  it('creates invisible Turnstile tokens when a site key is configured', async function testTurnstileSiteKey() {
    let renderOptions: { callback: (token: string) => void } | undefined
    window.turnstile = {
      execute: vi.fn(function executeTurnstile() {
        renderOptions?.callback('turnstile-token')
      }),
      render: vi.fn(function renderTurnstile(_container, options) {
        renderOptions = options
        return 'turnstile-widget'
      }),
      remove: vi.fn(),
      reset: vi.fn()
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          token: 'wmcp_session.test.signature',
          tokenType: 'Bearer'
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          confidence: 0.91,
          input: { ids: ['item_8'] },
          reason: 'Selected water.',
          toolName: 'select_items'
        })
      )
    vi.stubGlobal('fetch', fetch)

    const planner = createHostedOpenAIPlanner({
      accessKey: paidAccessKey,
      browserChallengeSiteKey: 'turnstile-site-key',
      endpoint: '/api/webmcp/plan',
      model: 'gpt-5.4-mini',
      sessionEndpoint: '/api/webmcp/session'
    })
    await planner.plan('Select water', [createSelectItemsTool()], {})

    const sessionRequest = fetch.mock.calls[0]?.[1] as RequestInit
    expect(window.turnstile.render).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        execution: 'execute',
        sitekey: 'turnstile-site-key',
        size: 'invisible'
      })
    )
    expect(window.turnstile.execute).toHaveBeenCalledWith('turnstile-widget')
    expect(JSON.parse(String(sessionRequest.body))).toMatchObject({
      turnstileToken: 'turnstile-token'
    })
  })
})

function createSelectItemsTool(): WebMCPTool {
  return {
    description: 'Select checklist items.',
    async execute() {
      return {}
    },
    inputSchema: {
      additionalProperties: false,
      properties: {
        ids: {
          items: {
            type: 'string'
          },
          type: 'array'
        }
      },
      required: ['ids'],
      type: 'object'
    },
    name: 'select_items'
  }
}
