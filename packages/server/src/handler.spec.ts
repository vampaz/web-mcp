import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResolver, type JsonSchema, type WebMCPTool } from '@vampaz/webmcp-kit'
import { createResolverHandler } from './handler'
import type { ResolverEndpointRequest, ResolverHandlerOptions } from './interfaces/handler'

const url = 'https://app.example/api/webmcp/resolve'
const apiKey = 'sk-server-secret'
const message = 'Read the application counter'
const secretContext = { privateValue: 'context-secret' }

const readTool = {
  name: 'read_counter',
  description: 'Read the application counter.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false }
} as const
const writeTool = {
  name: 'set_counter',
  description: 'Set the application counter.',
  inputSchema: {
    type: 'object',
    properties: { value: { type: 'integer' } },
    required: ['value'],
    additionalProperties: false
  }
} as const
const replyTool = {
  name: 'pi_reply',
  description: 'Reply to the user.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false
  }
} as const

const resolution = {
  toolName: 'read_counter',
  input: {},
  confidence: 1,
  reason: 'Read the current counter.'
}

function payload(overrides: Partial<ResolverEndpointRequest> = {}): ResolverEndpointRequest {
  return {
    provider: 'openai',
    model: 'model-a',
    message,
    tools: [readTool],
    context: secretContext,
    responseSchema: { type: 'object' },
    ...overrides
  }
}

function handler(overrides: Partial<ResolverHandlerOptions> = {}) {
  return createResolverHandler({
    provider: 'openai',
    baseUrl: 'https://provider.example/v1',
    apiKey,
    allowedModels: ['model-a'],
    authorize() {
      return true
    },
    ...overrides
  })
}

function post(body: unknown, init: RequestInit = {}): Request {
  return rawPost(JSON.stringify(body), init)
}

function rawPost(body: BodyInit | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return new Request(url, { ...init, method: 'POST', headers, body })
}

function streamPost(chunks: string[], init: RequestInit = {}): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    }
  })
  return new Request(url, {
    ...init,
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json', ...init.headers }),
    body: stream,
    duplex: 'half'
  } as RequestInit)
}

function providerContent(content: unknown, finishReason?: string): Response {
  return Response.json({
    choices: [
      {
        ...(finishReason ? { finish_reason: finishReason } : {}),
        message: {
          content: typeof content === 'string' ? content : JSON.stringify(content)
        }
      }
    ]
  })
}

function stubProvider(content: unknown = resolution) {
  const fetch = vi.fn(async function provider(_input: string | URL | Request, _init?: RequestInit) {
    return providerContent(content)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function responseBody(response: Response) {
  return (await response.json()) as { error?: string } & Record<string, unknown>
}

function expectSafe(text: string) {
  expect(text).not.toContain(apiKey)
  expect(text).not.toContain(message)
  expect(text).not.toContain(secretContext.privateValue)
}

afterEach(function cleanup() {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('configuration', function configuration() {
  it('validates the server-owned configuration', function invalid() {
    expect(function provider() {
      handler({ provider: 'local' as never })
    }).toThrow('provider must be')
    expect(function baseUrl() {
      handler({ baseUrl: '/relative' })
    }).toThrow('absolute URL')
    expect(function credentials() {
      handler({ baseUrl: 'https://user:pass@provider.example/v1' })
    }).toThrow('must not include credentials')
    expect(function key() {
      handler({ apiKey: ' ' })
    }).toThrow('apiKey')
    expect(function models() {
      handler({ allowedModels: [] })
    }).toThrow('allowedModels')
    expect(function authorize() {
      handler({ authorize: undefined as never })
    }).toThrow('authorize')
    expect(function bodySize() {
      handler({ maxBodyBytes: 0 })
    }).toThrow('maxBodyBytes')
    expect(function tokens() {
      handler({ maxTokens: 0 })
    }).toThrow('maxTokens')
    expect(function temperature() {
      handler({ temperature: 3 })
    }).toThrow('temperature')
  })
})

describe('request contract', function requestContract() {
  it('accepts a valid request and forwards the shared prompt and key', async function success() {
    const fetch = stubProvider()
    const authorize = vi.fn(function authorize(
      _request: Request,
      _payload: ResolverEndpointRequest
    ) {
      return true
    })
    const response = await handler({ authorize })(post(payload()))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(resolution)
    expect(authorize).toHaveBeenCalledOnce()
    expect(authorize.mock.calls[0]![0]).toBeInstanceOf(Request)
    expect(authorize.mock.calls[0]![1]).toMatchObject({ model: 'model-a' })
    const [target, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(target).toBe('https://provider.example/v1/chat/completions')
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${apiKey}`)
    const body = JSON.parse(String(init.body)) as {
      model: string
      messages: Array<{ role: string; content: string }>
      response_format: unknown
    }
    expect(body.model).toBe('model-a')
    expect(body.messages[0]!.role).toBe('system')
    expect(body.messages[1]!.content).toContain(message)
    expect(body.messages[1]!.content).toContain('read_counter')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(JSON.stringify(body)).not.toContain(apiKey)
  })

  it.each(['GET', 'PUT', 'DELETE'])('rejects %s', async function method(name) {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const response = await handler()(new Request(url, { method: name }))
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
    await expect(responseBody(response)).resolves.toEqual({ error: 'Method not allowed.' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects missing, empty, truncated, and invalid JSON bodies', async function bodies() {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    for (const request of [
      new Request(url, { method: 'POST' }),
      rawPost(''),
      rawPost('{'),
      rawPost('{"model":'),
      rawPost('not json')
    ]) {
      const response = await handler()(request)
      expect(response.status).toBe(400)
      expect((await responseBody(response)).error).toBeTruthy()
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['empty object', '{}'],
    ['missing tools', JSON.stringify({ ...payload(), tools: undefined })],
    ['tools object', JSON.stringify({ ...payload(), tools: {} })],
    ['invalid tool', JSON.stringify({ ...payload(), tools: [{ name: 'read' }] })],
    ['extra tool field', JSON.stringify({ ...payload(), tools: [{ ...readTool, extra: true }] })],
    ['duplicate tools', JSON.stringify({ ...payload(), tools: [readTool, readTool] })],
    ['array context', JSON.stringify({ ...payload(), context: [] })],
    ['missing schema', JSON.stringify({ ...payload(), responseSchema: null })],
    [
      'invalid response schema',
      JSON.stringify({ ...payload(), responseSchema: { type: 'object', properties: 42 } })
    ],
    [
      'invalid input schema properties',
      JSON.stringify({
        ...payload(),
        tools: [{ ...readTool, inputSchema: { type: 'object', properties: null } }]
      })
    ],
    [
      'invalid input schema required',
      JSON.stringify({
        ...payload(),
        tools: [{ ...readTool, inputSchema: { type: 'object', required: 'value' } }]
      })
    ],
    [
      'unknown schema type',
      JSON.stringify({
        ...payload(),
        tools: [{ ...readTool, inputSchema: { type: 'mystery' } }]
      })
    ],
    [
      'invalid output schema',
      JSON.stringify({
        ...payload(),
        tools: [{ ...readTool, outputSchema: { properties: 42 } }]
      })
    ],
    [
      'invalid annotation',
      JSON.stringify({
        ...payload(),
        tools: [{ ...readTool, annotations: { readOnlyHint: 'yes' } }]
      })
    ],
    ['unknown provider', JSON.stringify({ ...payload(), provider: 'bogus' })],
    ['false singleStep', JSON.stringify({ ...payload(), singleStep: false })],
    ['invalid purpose', JSON.stringify({ ...payload(), purpose: 'other' })],
    ['extra field', JSON.stringify({ ...payload(), extra: true })]
  ])('rejects an invalid %s', async function shape(_name, body) {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const authorize = vi.fn(() => true)
    const response = await handler({ authorize })(rawPost(body))
    expect(response.status).toBe(400)
    expect((await responseBody(response)).error).toBe('The resolver request is invalid.')
    expect(authorize).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts chunked JSON bodies without Content-Length', async function chunked() {
    stubProvider()
    const body = JSON.stringify(payload())
    const response = await handler()(
      streamPost([body.slice(0, 20), body.slice(20, 80), body.slice(80)])
    )
    expect(response.status).toBe(200)
  })

  it('bounds the body by reading the stream, not Content-Length', async function bounded() {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const body = JSON.stringify(payload())
    const response = await handler({ maxBodyBytes: 64 })(
      streamPost([body], { headers: { 'Content-Length': '1' } })
    )
    expect(response.status).toBe(413)
    expect((await responseBody(response)).error).toBe('The request body is too large.')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 413 when oversized body cancellation never settles', async function stalledCancel() {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const authorize = vi.fn(() => true)
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(128)))
      },
      cancel() {
        cancelled = true
        return new Promise<void>(function never() {})
      }
    })
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half'
    } as RequestInit)
    const response = await handler({ maxBodyBytes: 64, authorize })(request)
    expect(response.status).toBe(413)
    expect((await responseBody(response)).error).toBe('The request body is too large.')
    expect(cancelled).toBe(true)
    expect(authorize).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('enforces the default 1 MiB body limit', async function defaultLimit() {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const response = await handler()(
      rawPost(JSON.stringify({ ...payload(), message: 'x'.repeat(1024 * 1024) }))
    )
    expect(response.status).toBe(413)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('authorization and model policy', function authorization() {
  it('forwards configured sampling options', async function sampling() {
    const fetch = stubProvider()
    const response = await handler({
      maxTokens: 512,
      temperature: 0.2,
      reasoningEffort: 'low'
    })(post(payload()))
    expect(response.status).toBe(200)
    const init = fetch.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.max_tokens).toBe(512)
    expect(body.temperature).toBe(0.2)
    expect(body.reasoning_effort).toBe('low')
  })

  it('authorizes before checking the model allowlist', async function authorizeFirst() {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const authorize = vi.fn(() => false)
    const response = await handler({ authorize })(post(payload({ model: 'model-b' })))
    expect(authorize).toHaveBeenCalledOnce()
    expect(response.status).toBe(403)
    expect((await responseBody(response)).error).toBe('The request is not authorized.')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses one denial for unauthorized and disallowed models', async function indistinguishable() {
    const authorize = vi.fn(() => false)
    const unauthorized = await handler({ authorize })(post(payload({ model: 'model-a' })))
    const disallowed = await handler({ authorize })(post(payload({ model: 'model-b' })))
    expect(unauthorized.status).toBe(disallowed.status)
    await expect(unauthorized.text()).resolves.toBe(await disallowed.text())
  })

  it('rejects an allowed caller model outside the allowlist', async function allowlist() {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const authorize = vi.fn(() => true)
    const response = await handler({ authorize })(post(payload({ model: 'model-b' })))
    expect(authorize).toHaveBeenCalledOnce()
    expect(response.status).toBe(403)
    expect((await responseBody(response)).error).toBe('The requested model is not allowed.')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('allows only a literal true from authorize', async function onlyTrue() {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    for (const decision of [false, 1, 'true', null, undefined]) {
      const response = await handler({ authorize: () => decision as never })(post(payload()))
      expect(response.status).toBe(403)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('treats an authorize throw as a denial without exposing the error', async function throws() {
    const response = await handler({
      authorize() {
        throw new Error(`denied ${apiKey} ${message}`)
      }
    })(post(payload()))
    expect(response.status).toBe(403)
    const text = await response.text()
    expect(text).toBe(JSON.stringify({ error: 'The request is not authorized.' }))
    expectSafe(text)
  })

  it('does not let authorize mutate the validated model', async function mutation() {
    const fetch = stubProvider()
    const response = await handler({
      authorize(_request, protectedPayload) {
        protectedPayload.model = 'forbidden-model'
        return true
      }
    })(post(payload()))
    expect(response.status).toBe(200)
    const init = fetch.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body)) as { model: string }
    expect(body.model).toBe('model-a')
  })

  it('accepts an async true decision', async function asyncTrue() {
    stubProvider()
    const response = await handler({ authorize: async () => true })(post(payload()))
    expect(response.status).toBe(200)
  })
})

describe('server input schema patterns', function patterns() {
  const positions: Array<[string, JsonSchema, string]> = [
    ['root', { type: 'string', pattern: '^a$' }, 'inputSchema'],
    [
      'properties',
      {
        type: 'object',
        properties: { note: { type: 'string', pattern: '^a$' } },
        additionalProperties: false
      },
      'inputSchema.properties.note'
    ],
    ['items', { type: 'array', items: { type: 'string', pattern: '^a$' } }, 'inputSchema.items'],
    [
      'prefixItems',
      { type: 'array', prefixItems: [{ type: 'string', pattern: '^a$' }] },
      'inputSchema.prefixItems[0]'
    ],
    ['anyOf', { anyOf: [{ type: 'string', pattern: '^a$' }] }, 'inputSchema.anyOf[0]'],
    ['oneOf', { oneOf: [{ type: 'string', pattern: '^a$' }] }, 'inputSchema.oneOf[0]'],
    ['allOf', { allOf: [{ type: 'string', pattern: '^a$' }] }, 'inputSchema.allOf[0]'],
    ['not', { not: { type: 'string', pattern: '^a$' } }, 'inputSchema.not'],
    [
      'propertyNames',
      { type: 'object', propertyNames: { pattern: '^a$' } },
      'inputSchema.propertyNames'
    ],
    [
      'additionalProperties',
      {
        type: 'object',
        additionalProperties: { type: 'string', pattern: '^a$' }
      },
      'inputSchema.additionalProperties'
    ]
  ]

  it.each(positions)(
    'rejects a pattern in %s before authorization',
    async function rejects(_label, inputSchema, path) {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      const authorize = vi.fn(() => true)
      const response = await handler({ authorize })(
        post(payload({ tools: [{ ...readTool, inputSchema }] }))
      )
      expect(response.status).toBe(400)
      const message = (await responseBody(response)).error
      expect(message).toContain(`${path}.pattern`)
      expect(message).toContain('authoritative tool definition')
      expect(authorize).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    }
  )

  it('accepts pattern as a property name or data value', async function harmless() {
    const fetch = stubProvider({
      toolName: 'read_counter',
      input: { pattern: '(a+)+$', note: 'pattern', tag: 'pattern', text: 'pattern' },
      confidence: 1,
      reason: 'Read.'
    })
    const inputSchema: JsonSchema = {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        note: { type: 'string', enum: ['pattern'] },
        tag: { type: 'string', const: 'pattern' },
        text: { type: 'string', default: 'pattern', examples: ['pattern'] }
      },
      required: ['pattern', 'note', 'tag', 'text'],
      additionalProperties: false
    }
    const response = await handler()(post(payload({ tools: [{ ...readTool, inputSchema }] })))
    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('accepts a pattern in outputSchema because it is not evaluated', async function output() {
    const fetch = stubProvider()
    const response = await handler()(
      post(
        payload({
          tools: [{ ...readTool, outputSchema: { type: 'string', pattern: '^a$' } }]
        })
      )
    )
    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledOnce()
  })
})

describe('upstream failures', function upstreamFailures() {
  it('returns a safe non-2xx for a provider error without its body or key', async function providerError() {
    const fetch = vi.fn(async function provider() {
      return Response.json(
        { error: `bad key ${apiKey}`, echo: { message, context: secretContext } },
        { status: 401 }
      )
    })
    vi.stubGlobal('fetch', fetch)
    const response = await handler()(post(payload()))
    expect(response.status).toBe(502)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      error: 'The model provider returned 401.'
    })
    expectSafe(text)
  })

  it('returns a safe non-2xx for a network failure', async function network() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function provider() {
        throw new Error(`network ${apiKey}`)
      })
    )
    const response = await handler()(post(payload()))
    expect(response.status).toBe(502)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ error: 'The model provider request failed.' })
    expectSafe(text)
  })

  it('returns a non-2xx for malformed provider envelopes', async function malformed() {
    for (const body of [
      {},
      { choices: [] },
      { choices: [{}] },
      { choices: [{ message: {} }] },
      { choices: [{ message: { content: '' } }] },
      { choices: [{ message: { content: 'not json' } }] }
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async function provider() {
          return Response.json(body)
        })
      )
      const response = await handler()(post(payload()))
      expect(response.status).toBe(502)
      expect((await responseBody(response)).error).toBeTruthy()
    }
  })

  it('returns a non-2xx when the provider stops at the output limit', async function limit() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function provider() {
        return providerContent(resolution, 'length')
      })
    )
    const response = await handler()(post(payload()))
    expect(response.status).toBe(502)
  })

  it.each([
    ['unknown tool', { toolName: 'unknown', input: {}, confidence: 1, reason: 'x' }],
    ['invalid input', { toolName: 'set_counter', input: {}, confidence: 1, reason: 'x' }],
    ['missing confidence', { toolName: 'read_counter', input: {}, reason: 'x' }],
    [
      'sequence for single step',
      {
        toolName: 'tool_sequence',
        input: {},
        confidence: 1,
        reason: 'x',
        steps: [{ toolName: 'read_counter', input: {}, confidence: 1, reason: 'x' }]
      }
    ]
  ])('rejects a %s resolution', async function invalidResolution(_name, body) {
    stubProvider(body)
    const response = await handler()(
      post(payload({ tools: [readTool, writeTool], singleStep: true }))
    )
    expect(response.status).toBe(502)
    expect((await responseBody(response)).error).toBe(
      'The model provider returned an invalid resolution.'
    )
  })
})

describe('structured and summary requests', function structured() {
  it('wraps single-step structured responses and ignores client schema constraints', async function structuredSingle() {
    const fetch = stubProvider({ action: resolution })
    const response = await handler({ responseFormat: 'json_schema' })(
      post(
        payload({
          singleStep: true,
          responseSchema: {
            type: 'object',
            properties: { clientOnly: { type: 'string' } },
            required: ['clientOnly']
          }
        })
      )
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(resolution)
    const init = fetch.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body)) as {
      response_format: { json_schema: { schema: Record<string, unknown> } }
    }
    expect(body.response_format.json_schema.schema.required).toEqual(['action'])
    expect(JSON.stringify(body.response_format.json_schema.schema)).not.toContain('clientOnly')
  })

  it('rejects a structured response without action or with an invalid schema', async function structuredBad() {
    for (const content of [{}, { action: { toolName: 'unknown' } }]) {
      stubProvider(content)
      const response = await handler({ responseFormat: 'json_schema' })(
        post(payload({ singleStep: true }))
      )
      expect(response.status).toBe(502)
    }
  })

  it('honors summary prompts and excludes resolver outcomes', async function summary() {
    const fetch = stubProvider({
      toolName: 'pi_reply',
      input: { text: 'Summary' },
      confidence: 1,
      reason: 'Summary.'
    })
    const response = await handler()(
      post(payload({ tools: [replyTool], purpose: 'summary', singleStep: true }))
    )
    expect(response.status).toBe(200)
    const init = fetch.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ content: string }>
    }
    expect(body.messages[0]!.content).toContain('Summarize')
    expect(body.messages[1]!.content).not.toContain('needs_clarification')
  })

  it('excludes resolver outcomes from the structured summary schema', async function summarySchema() {
    const fetch = stubProvider({
      action: {
        toolName: 'pi_reply',
        input: { text: 'Summary' },
        confidence: 1,
        reason: 'Summary.'
      }
    })
    const response = await handler({ responseFormat: 'json_schema' })(
      post(payload({ tools: [replyTool], purpose: 'summary', singleStep: true }))
    )
    expect(response.status).toBe(200)
    const init = fetch.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body)) as {
      response_format: { json_schema: { schema: { properties: { action: unknown } } } }
    }
    expect(JSON.stringify(body.response_format.json_schema.schema.properties.action)).not.toContain(
      'needs_clarification'
    )
  })

  it('rejects a summary that selects an application action outcome', async function summaryOutcome() {
    stubProvider({
      toolName: 'no_tools_match',
      input: {},
      confidence: 1,
      reason: 'No match'
    })
    const response = await handler()(
      post(payload({ tools: [replyTool], purpose: 'summary', singleStep: true }))
    )
    expect(response.status).toBe(502)
  })
})

describe('cancellation', function cancellation() {
  it('returns 499 for a preaborted request', async function preaborted() {
    const controller = new AbortController()
    controller.abort()
    const authorize = vi.fn(() => true)
    const response = await handler({ authorize })(post(payload(), { signal: controller.signal }))
    expect(response.status).toBe(499)
    expect(authorize).not.toHaveBeenCalled()
  })

  it('returns 499 when a stalled body stream ignores abort', async function bodyAborted() {
    const controller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      start() {
        // Deliberately never enqueue, close, or react to the signal.
      }
    })
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
      signal: controller.signal
    } as RequestInit)
    const authorize = vi.fn(() => true)
    const pending = handler({ authorize })(request)
    await Promise.resolve()
    controller.abort()
    const response = await pending
    expect(response.status).toBe(499)
    expect((await responseBody(response)).error).toBe('The request was cancelled.')
    expect(authorize).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'returns 499 when authorization later resolves %s after abort',
    async function authAborted(decision) {
      const controller = new AbortController()
      let resolveAuth!: (value: boolean) => void
      const authorize = vi.fn(function authorize() {
        return new Promise<boolean>(function wait(resolve) {
          resolveAuth = resolve
        })
      })
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      const pending = handler({ authorize })(post(payload(), { signal: controller.signal }))
      await vi.waitFor(function started() {
        expect(authorize).toHaveBeenCalledOnce()
      })
      controller.abort()
      const response = await pending
      expect(response.status).toBe(499)
      expect((await responseBody(response)).error).toBe('The request was cancelled.')
      resolveAuth(decision)
      await Promise.resolve()
      expect(fetch).not.toHaveBeenCalled()
    }
  )

  it('returns 499 when the request aborts during the upstream call', async function aborted() {
    const controller = new AbortController()
    const fetch = vi.fn(function provider(_url: string, init: RequestInit) {
      return new Promise<Response>(function wait(_resolve, reject) {
        init.signal?.addEventListener(
          'abort',
          function abort() {
            reject(new DOMException('Aborted', 'AbortError'))
          },
          { once: true }
        )
      })
    })
    vi.stubGlobal('fetch', fetch)
    const pending = handler()(post(payload(), { signal: controller.signal }))
    await vi.waitFor(function started() {
      expect(fetch).toHaveBeenCalledOnce()
    })
    controller.abort()
    const response = await pending
    expect(response.status).toBe(499)
    expect((await responseBody(response)).error).toBe('The request was cancelled.')
  })
})

describe('browser resolver compatibility', function compatibility() {
  it('accepts createResolver server-mode requests and returns a validated resolution', async function wire() {
    const endpoint = url
    const upstream = vi.fn(async function provider(
      _input: string | URL | Request,
      _init?: RequestInit
    ) {
      return providerContent(resolution)
    })
    const server = handler()
    vi.stubGlobal(
      'fetch',
      vi.fn(async function route(input: string | URL | Request, init?: RequestInit) {
        if (String(input) === endpoint) return server(new Request(endpoint, init))
        return upstream(input, init)
      })
    )
    const resolver = await createResolver({
      provider: 'openai',
      model: 'model-a',
      auth: { mode: 'server', endpoint }
    })
    const tools: WebMCPTool[] = [
      {
        ...readTool,
        execute() {
          return { value: 0 }
        }
      }
    ]

    await expect(
      resolver.resolve(message, tools, secretContext, { singleStep: true })
    ).resolves.toEqual(resolution)
    const init = upstream.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> }
    expect(body.messages[1]!.content).toContain('never a sequence')
  })

  it('accepts createResolver summary requests and preserves the purpose', async function summaryWire() {
    const endpoint = url
    const summary = {
      toolName: 'pi_reply',
      input: { text: 'Summary' },
      confidence: 1,
      reason: 'Summary.'
    }
    const upstream = vi.fn(async function provider(
      _input: string | URL | Request,
      _init?: RequestInit
    ) {
      return providerContent(summary)
    })
    const server = handler()
    vi.stubGlobal(
      'fetch',
      vi.fn(async function route(input: string | URL | Request, init?: RequestInit) {
        if (String(input) === endpoint) return server(new Request(endpoint, init))
        return upstream(input, init)
      })
    )
    const resolver = await createResolver({
      provider: 'openai',
      model: 'model-a',
      auth: { mode: 'server', endpoint }
    })
    const tools: WebMCPTool[] = [
      {
        ...replyTool,
        execute() {
          return { text: 'Summary' }
        }
      }
    ]

    await expect(
      resolver.resolve('Summarize the conversation', tools, {}, { purpose: 'summary' })
    ).resolves.toEqual(summary)
    const init = upstream.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> }
    expect(body.messages[0]!.content).toContain('Summarize')
  })
})
