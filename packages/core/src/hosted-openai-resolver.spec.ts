import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WebMCPTool } from './interfaces/tool'
import { createHostedOpenAIResolver } from './hosted-openai-resolver'

const paidAccessKey = 'wmcp_pk_test_access123_secret123secret456'

describe('createHostedOpenAIResolver', function describeHostedOpenAIResolver() {
  afterEach(function cleanup() {
    delete window.turnstile
    delete window.webmcpCreateTurnstileToken
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('mints a session before resolving and never sends the publishable license to the spend endpoint', async function testSessionFlow() {
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

    const resolver = createHostedOpenAIResolver({
      accessKey: paidAccessKey,
      endpoint: '/api/webmcp/resolve',
      model: 'gpt-5.4-mini',
      sessionEndpoint: '/api/webmcp/session'
    })
    const resolution = await resolver.resolve('Select water', [createSelectItemsTool()], {})

    expect(resolution.toolName).toBe('select_items')
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/webmcp/session',
      expect.objectContaining({
        method: 'POST'
      })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/webmcp/resolve',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer wmcp_session.test.signature'
        }),
        method: 'POST'
      })
    )

    const resolutionRequest = fetch.mock.calls[1]?.[1] as RequestInit
    expect(JSON.stringify(resolutionRequest)).not.toContain(paidAccessKey)
  })

  it('caches fresh sessions for later resolutions', async function testSessionCache() {
    const fetch = vi.fn(async function fetchHostedResolver(url: string) {
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

    const resolver = createHostedOpenAIResolver({
      accessKey: paidAccessKey,
      endpoint: '/api/webmcp/resolve',
      model: 'gpt-5.4-mini',
      sessionEndpoint: '/api/webmcp/session'
    })

    await resolver.resolve('Select water', [createSelectItemsTool()], {})
    await resolver.resolve('Select water again', [createSelectItemsTool()], {})

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

    const resolver = createHostedOpenAIResolver({
      accessKey: paidAccessKey,
      endpoint: '/api/webmcp/resolve',
      model: 'gpt-5.4-mini',
      sessionEndpoint: '/api/webmcp/session'
    })
    await resolver.resolve('Select water', [createSelectItemsTool()], {})

    const sessionRequest = fetch.mock.calls[0]?.[1] as RequestInit
    expect(createToken).toHaveBeenCalledWith({
      model: 'gpt-5.4-mini',
      serviceId: 'hosted-openai-resolver'
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

    const resolver = createHostedOpenAIResolver({
      accessKey: paidAccessKey,
      browserChallengeSiteKey: 'turnstile-site-key',
      endpoint: '/api/webmcp/resolve',
      model: 'gpt-5.4-mini',
      sessionEndpoint: '/api/webmcp/session'
    })
    await resolver.resolve('Select water', [createSelectItemsTool()], {})

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

  it('allows another challenge-script request after a failed load', async function test() {
    const resolver = createHostedOpenAIResolver({
      accessKey: paidAccessKey,
      browserChallengeSiteKey: 'site-key',
      model: 'test-model'
    })
    const pending = resolver.resolve('Select water', [createSelectItemsTool()], {})
    const rejected = expect(pending).rejects.toThrow('script failed to load')
    await vi.waitFor(function scriptReady() {
      expect(document.querySelector('script[src*="turnstile"]')).not.toBeNull()
    })
    const first = document.querySelector('script[src*="turnstile"]')!
    first.dispatchEvent(new Event('error'))
    await rejected
    expect(first.isConnected).toBe(false)
    const retry = resolver.resolve('Select water', [createSelectItemsTool()], {})
    const retryRejected = expect(retry).rejects.toThrow('script failed to load')
    await vi.waitFor(function scriptReady() {
      expect(document.querySelector('script[src*="turnstile"]')).not.toBeNull()
    })
    const second = document.querySelector('script[src*="turnstile"]')!
    expect(second).not.toBe(first)
    second.dispatchEvent(new Event('error'))
    await retryRejected
  })

  it('cancels pending browser challenges and removes the widget', async function test() {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    window.turnstile = {
      render: vi.fn(function render() {
        return 'pending-widget'
      }),
      execute: vi.fn(),
      remove: vi.fn(),
      reset: vi.fn()
    }
    const resolver = createHostedOpenAIResolver({
      accessKey: paidAccessKey,
      browserChallengeSiteKey: 'site-key',
      model: 'test-model'
    })
    const controller = new AbortController()
    const pending = resolver.resolve(
      'Select water',
      [createSelectItemsTool()],
      {},
      { signal: controller.signal }
    )
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(function challengeStarted() {
      expect(window.turnstile!.execute).toHaveBeenCalled()
    })
    const container = vi.mocked(window.turnstile.render).mock.calls[0]![0]
    controller.abort()
    await rejected
    expect(window.turnstile.remove).toHaveBeenCalledWith('pending-widget')
    expect(container.isConnected).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
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

describe('hosted endpoint resolution', function describeHostedEndpointResolution() {
  afterEach(function cleanup() {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('derives resolution and session endpoints from a base URL', async function testBaseUrlDerivation() {
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

    const resolver = createHostedOpenAIResolver({
      accessKey: paidAccessKey,
      baseUrl: 'https://webmcp.example/',
      model: 'gpt-5.4-mini'
    })
    await resolver.resolve('Select water', [createSelectItemsTool()], {})

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://webmcp.example/api/webmcp/session',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://webmcp.example/api/webmcp/resolve',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('defaults to same-origin endpoints without a base URL', function testDefaultEndpoints() {
    const resolver = createHostedOpenAIResolver({
      accessKey: paidAccessKey,
      model: 'gpt-5.4-mini'
    })

    expect(resolver.status).toBe('ready')
  })
})
