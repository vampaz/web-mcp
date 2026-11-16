import type { ToolResolution } from '@vampaz/webmcp-kit'
import { raceAbort } from '../../core/src/abort'
import { createResolverMessages } from '../../core/src/resolver-prompt'
import {
  createStructuredToolResolutionSchema,
  createToolResolutionSchema,
  validateToolResolution
} from '../../core/src/resolution-validation'
import { normalizeJsonText } from '../../core/src/resolver-json'
import { validateJsonValue } from '../../core/src/schema'
import type {
  ResolverEndpointRequest,
  ResolverHandler,
  ResolverHandlerOptions,
  ResolverResponseError,
  ServerResolverProvider
} from './interfaces/handler'
import { readResolverRequest, ResolverRequestError } from './request'

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024
const providers: readonly ServerResolverProvider[] = ['openai', 'openrouter', 'openai-compatible']
const responseFormats = ['json_object', 'json_schema', 'text'] as const
const reasoningEfforts = ['none', 'low', 'medium', 'high'] as const

interface ResolverConfig extends ResolverHandlerOptions {
  upstreamUrl: string
  models: Set<string>
  maxBodyBytes: number
}

/**
 * Creates a web-standard resolver endpoint for `createResolver({ auth: { mode: 'server' } })`.
 * The application owns the upstream URL, key, provider, model allowlist, and authorization.
 */
export function createResolverHandler(options: ResolverHandlerOptions): ResolverHandler {
  const config = normalizeOptions(options)

  return async function resolverHandler(request: Request): Promise<Response> {
    try {
      if (request.method !== 'POST') return errorResponse('Method not allowed.', 405, 'POST')
      const payload = await readResolverRequest(request, config.maxBodyBytes)
      if (request.signal.aborted) return cancelled()
      if (!config.models.has(payload.model))
        return errorResponse('The requested model is not allowed.', 403)
      const decision = await authorize(config, request, payload)
      if (decision === 'cancelled' || request.signal.aborted) return cancelled()
      if (decision !== 'allowed') return errorResponse('The request is not authorized.', 403)
      return await resolveUpstream(config, payload, request.signal)
    } catch (error) {
      if (error instanceof ResolverRequestError) return errorResponse(error.message, error.status)
      if (request.signal.aborted) return cancelled()
      return errorResponse('The resolver request failed.', 500)
    }
  }
}

type AuthorizationDecision = 'allowed' | 'denied' | 'cancelled'

async function authorize(
  config: ResolverConfig,
  request: Request,
  payload: ResolverEndpointRequest
): Promise<AuthorizationDecision> {
  if (request.signal.aborted) return 'cancelled'
  try {
    const decision = await raceAbort(
      Promise.resolve(config.authorize(request, copyPayload(payload))),
      request.signal,
      'The request was cancelled.'
    )
    if (request.signal.aborted) return 'cancelled'
    return decision === true ? 'allowed' : 'denied'
  } catch {
    return request.signal.aborted ? 'cancelled' : 'denied'
  }
}

function copyPayload(payload: ResolverEndpointRequest): ResolverEndpointRequest {
  return JSON.parse(JSON.stringify(payload)) as ResolverEndpointRequest
}

async function resolveUpstream(
  config: ResolverConfig,
  payload: ResolverEndpointRequest,
  signal: AbortSignal
): Promise<Response> {
  if (signal.aborted) return cancelled()
  const singleStep = payload.singleStep === true || payload.purpose === 'summary'
  const structured = config.responseFormat === 'json_schema'
  const wrapped = structured && singleStep
  const responseSchema = wrapped
    ? createStructuredToolResolutionSchema(payload.tools, payload.purpose)
    : createToolResolutionSchema(payload.tools, singleStep, payload.purpose)
  const body = {
    model: payload.model,
    messages: createResolverMessages(
      payload.message,
      payload.tools,
      payload.context,
      singleStep,
      structured,
      payload.purpose
    ),
    response_format: structured
      ? {
          type: 'json_schema',
          json_schema: {
            name: 'webmcp_resolution',
            schema: responseSchema
          }
        }
      : { type: config.responseFormat ?? 'json_object' },
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
    ...(config.reasoningEffort !== undefined ? { reasoning_effort: config.reasoningEffort } : {})
  }

  let response: Response
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`
  }
  if (config.provider === 'openrouter') headers['X-Title'] = 'WebMCP Kit'
  try {
    response = await fetch(config.upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      redirect: 'error'
    })
  } catch {
    return signal.aborted ? cancelled() : providerFailed()
  }

  if (!response.ok) {
    try {
      await response.body?.cancel()
    } catch {
      // The response body is already closed.
    }
    return providerFailed(response.status)
  }

  let payloadBody: unknown
  try {
    payloadBody = await response.json()
  } catch {
    return signal.aborted ? cancelled() : invalidProviderResponse()
  }

  let content: string
  try {
    content = readProviderContent(payloadBody)
  } catch {
    return invalidProviderResponse()
  }

  let resolution: unknown
  try {
    resolution = JSON.parse(normalizeJsonText(content, 'The model provider'))
  } catch {
    return invalidResolution()
  }

  if (wrapped) {
    const action = isRecord(resolution) ? resolution.action : undefined
    if (!isValidResolution(action, payload, true)) return invalidResolution()
    if (validateJsonValue(resolution, responseSchema).length > 0) return invalidResolution()
    if (signal.aborted) return cancelled()
    return resolutionResponse(action as ToolResolution)
  }

  if (!isValidResolution(resolution, payload, singleStep)) return invalidResolution()
  if (signal.aborted) return cancelled()
  return resolutionResponse(resolution as ToolResolution)
}

function isValidResolution(
  resolution: unknown,
  payload: ResolverEndpointRequest,
  singleStep: boolean
): boolean {
  try {
    validateToolResolution(resolution, payload.tools, {
      singleStep,
      ...(payload.purpose ? { purpose: payload.purpose } : {}),
      messageStyle: 'server'
    })
    return true
  } catch {
    return false
  }
}

function readProviderContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0)
    throw new Error('invalid choices')
  const choice = payload.choices[0]
  if (!isRecord(choice)) throw new Error('invalid choice')
  if (choice.finish_reason === 'length') throw new Error('output limit')
  if (!isRecord(choice.message) || typeof choice.message.content !== 'string')
    throw new Error('missing content')
  if (!choice.message.content.trim()) throw new Error('empty content')
  return choice.message.content
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolutionResponse(resolution: ToolResolution): Response {
  return jsonResponse(resolution, 200)
}

function providerFailed(status?: number): Response {
  return errorResponse(
    status === undefined
      ? 'The model provider request failed.'
      : `The model provider returned ${status}.`,
    502
  )
}

function invalidProviderResponse(): Response {
  return errorResponse('The model provider returned an invalid response.', 502)
}

function invalidResolution(): Response {
  return errorResponse('The model provider returned an invalid resolution.', 502)
}

function cancelled(): Response {
  return errorResponse('The request was cancelled.', 499)
}

function errorResponse(message: string, status: number, allow?: string): Response {
  const headers = responseHeaders()
  if (allow) headers.set('Allow', allow)
  return new Response(JSON.stringify({ error: message } satisfies ResolverResponseError), {
    status,
    headers
  })
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders() })
}

function responseHeaders(): Headers {
  return new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
}

function normalizeOptions(options: ResolverHandlerOptions): ResolverConfig {
  if (!providers.includes(options.provider))
    throw new Error('provider must be openai, openrouter, or openai-compatible.')
  if (typeof options.apiKey !== 'string' || !options.apiKey.trim())
    throw new Error('apiKey must be a nonempty string.')
  if (!Array.isArray(options.allowedModels) || options.allowedModels.length === 0)
    throw new Error('allowedModels must contain at least one model.')
  for (const model of options.allowedModels) {
    if (typeof model !== 'string' || !model.trim())
      throw new Error('allowedModels must contain nonempty strings.')
  }
  if (typeof options.authorize !== 'function') throw new Error('authorize must be a function.')
  if (options.responseFormat !== undefined && !responseFormats.includes(options.responseFormat))
    throw new Error('responseFormat must be json_object, json_schema, or text.')
  if (
    options.maxTokens !== undefined &&
    (!Number.isSafeInteger(options.maxTokens) || options.maxTokens < 1 || options.maxTokens > 65536)
  )
    throw new Error('maxTokens must be an integer between 1 and 65536.')
  if (
    options.temperature !== undefined &&
    (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)
  )
    throw new Error('temperature must be between 0 and 2.')
  if (options.reasoningEffort !== undefined && !reasoningEfforts.includes(options.reasoningEffort))
    throw new Error('reasoningEffort must be none, low, medium, or high.')
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1)
    throw new Error('maxBodyBytes must be a positive safe integer.')

  return {
    ...options,
    upstreamUrl: createUpstreamUrl(options.baseUrl),
    models: new Set(options.allowedModels),
    maxBodyBytes
  }
}

function createUpstreamUrl(baseUrl: string): string {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('baseUrl must be an absolute URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('baseUrl must use http: or https:.')
  if (url.username || url.password) throw new Error('baseUrl must not include credentials.')
  url.hash = ''
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`
  return url.toString()
}
