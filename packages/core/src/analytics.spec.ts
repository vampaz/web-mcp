import { describe, expect, it, vi } from 'vitest'

import { createWebMCPAnalytics } from './analytics'
import { emitWebMCPKitEvent } from './events'

describe('WebMCP analytics', () => {
  it('is disabled by default', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const analytics = createWebMCPAnalytics({
      endpoint: 'https://api.webmcp.dev/v1/analytics'
    })

    await analytics.track({
      type: 'invoked',
      toolName: 'search_products',
      timestamp: 1
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends allowlisted events with the paid service access key', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    const analytics = createWebMCPAnalytics({
      enabled: true,
      endpoint: 'https://api.webmcp.dev/v1/analytics',
      eventTypes: ['succeeded'],
      paidServices: {
        accessKey: 'wmcp-publishable-key'
      }
    })

    await analytics.track({
      detail: {
        input: {
          query: 'dock'
        }
      },
      timestamp: 1,
      toolName: 'search_products',
      type: 'succeeded'
    })
    await analytics.track({
      timestamp: 2,
      toolName: 'search_products',
      type: 'failed'
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.webmcp.dev/v1/analytics',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer wmcp-publishable-key'
        })
      })
    )
    const fetchCalls = fetch.mock.calls as unknown as Array<[string, RequestInit]>
    const body = JSON.parse(String(fetchCalls[0]?.[1]?.body)) as {
      event: { detail?: unknown; type: string }
    }
    expect(body.event.type).toBe('succeeded')
    expect(body.event.detail).toBeUndefined()
  })

  it('subscribes to kit events only while started', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    const analytics = createWebMCPAnalytics({
      enabled: true,
      endpoint: 'https://api.webmcp.dev/v1/analytics'
    })

    analytics.start()
    emitWebMCPKitEvent({
      timestamp: 1,
      toolName: 'search_products',
      type: 'registered'
    })
    await Promise.resolve()
    analytics.stop()
    emitWebMCPKitEvent({
      timestamp: 2,
      toolName: 'search_products',
      type: 'unregistered'
    })
    await Promise.resolve()

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('redacts event detail when detail forwarding is explicitly enabled', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    const analytics = createWebMCPAnalytics({
      enabled: true,
      endpoint: 'https://api.webmcp.dev/v1/analytics',
      includeEventDetail: true
    })

    await analytics.track({
      detail: {
        apiKey: 'sk-test-secret',
        nested: {
          token: 'wmcp_pk_test_access123_secret123secret456',
          safe: 'visible'
        }
      },
      timestamp: 1,
      toolName: 'search_products',
      type: 'failed'
    })

    const fetchCalls = fetch.mock.calls as unknown as Array<[string, RequestInit]>
    const body = JSON.parse(String(fetchCalls[0]?.[1]?.body)) as { event: unknown }
    expect(JSON.stringify(body)).toContain('[redacted]')
    expect(JSON.stringify(body)).toContain('visible')
    expect(JSON.stringify(body)).not.toContain('sk-test-secret')
    expect(JSON.stringify(body)).not.toContain('secret123secret456')
  })
})
